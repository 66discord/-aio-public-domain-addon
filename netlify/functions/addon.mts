type IAFile = { name?: string; format?: string; source?: string; size?: string };
type IAItem = {
  metadata?: Record<string, unknown>;
  files?: IAFile[];
};
type IASearchDoc = {
  identifier?: string;
  title?: string;
  year?: string | number;
  description?: string;
  licenseurl?: string;
  language?: string;
};

const LICENSE_QUERY =
  '(licenseurl:http*creativecommons.org/publicdomain/zero/1.0* OR ' +
  'licenseurl:http*creativecommons.org/publicdomain/mark/1.0* OR ' +
  'licenseurl:http*creativecommons.org/licenses/by/4.0* OR ' +
  'licenseurl:http*creativecommons.org/licenses/by-sa/4.0* OR ' +
  'licenseurl:http*creativecommons.org/licenses/by/3.0* OR ' +
  'licenseurl:http*creativecommons.org/licenses/by-sa/3.0*)';

const CATALOGS: Record<string, { name: string; query: string }> = {
  ia_open_movies: { name: "Filmes com licença aberta", query: "" },
  ia_animation: { name: "Animações e desenhos", query: "AND (subject:animation OR subject:cartoon)" },
  ia_anime: { name: "Anime", query: 'AND (subject:anime OR title:anime)' },
  ia_documentaries: { name: "Documentários", query: 'AND (subject:documentary OR title:documentary)' },
};

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return value == null ? "" : String(value);
}

function allowedLicense(value: unknown): boolean {
  const url = text(value).toLowerCase();
  return (
    url.includes("creativecommons.org/publicdomain/zero/1.0") ||
    url.includes("creativecommons.org/publicdomain/mark/1.0") ||
    url.includes("creativecommons.org/licenses/by/4.0") ||
    url.includes("creativecommons.org/licenses/by-sa/4.0") ||
    url.includes("creativecommons.org/licenses/by/3.0") ||
    url.includes("creativecommons.org/licenses/by-sa/3.0")
  );
}

function safeTerms(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" AND ");
}

async function searchArchive(query: string, rows = 24): Promise<IASearchDoc[]> {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", query);
  url.searchParams.set("fl[]", "identifier,title,year,description,licenseurl,language");
  url.searchParams.set("rows", String(rows));
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  url.searchParams.set("sort[]", "downloads desc");
  const response = await fetch(url, { headers: { "User-Agent": "AIO-Public-Domain-Addon/1.0" } });
  if (!response.ok) throw new Error("Internet Archive search unavailable");
  const data = await response.json() as { response?: { docs?: IASearchDoc[] } };
  return (data.response?.docs ?? []).filter(item => item.identifier && allowedLicense(item.licenseurl));
}

async function getItem(identifier: string): Promise<IAItem> {
  const response = await fetch("https://archive.org/metadata/" + encodeURIComponent(identifier), {
    headers: { "User-Agent": "AIO-Public-Domain-Addon/1.0" },
  });
  if (!response.ok) throw new Error("Item metadata unavailable");
  return await response.json() as IAItem;
}

function playableFile(files: IAFile[]): IAFile | undefined {
  const candidates = files.filter(file => {
    const name = (file.name ?? "").toLowerCase();
    const size = Number(file.size ?? 0);
    return /\.(mp4|webm)$/.test(name) && (!size || size <= 3_000_000_000);
  });
  candidates.sort((a, b) => {
    const score = (f: IAFile) => {
      const name = (f.name ?? "").toLowerCase();
      return (name.endsWith(".mp4") ? 10 : 0) + (f.source === "original" ? 3 : 0) +
        (/h\.264|h264|mpeg4/i.test(f.format ?? "") ? 2 : 0);
    };
    return score(b) - score(a);
  });
  return candidates[0];
}

function itemId(identifier: string): string {
  return "ia:" + identifier;
}

export default async (req: Request, context: { params: Record<string, string> }) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/manifest.json") {
    return Response.json({
      id: "community.aio.publicdomain",
      version: "1.0.0",
      name: "AIO Public Domain",
      description: "Catálogo comunitário de vídeos do Internet Archive com licenças abertas verificadas.",
      resources: ["catalog", "meta", "stream"],
      types: ["movie"],
      idPrefixes: ["ia:"],
      catalogs: Object.entries(CATALOGS).map(([id, value]) => ({
        type: "movie",
        id,
        name: value.name,
        extra: [{ name: "search", isRequired: false }],
      })),
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  if (path.startsWith("/catalog/")) {
    const catalogId = context.params.id;
    const catalog = CATALOGS[catalogId];
    if (!catalog) return Response.json({ metas: [] }, { status: 404 });
    const search = safeTerms(url.searchParams.get("search") ?? "");
    const titleQuery = search ? " AND title:(" + search + ")" : "";
    const query = "mediatype:movies AND " + LICENSE_QUERY + catalog.query + titleQuery;
    try {
      const docs = await searchArchive(query, 24);
      const metas = docs.map(doc => ({
        id: itemId(doc.identifier!),
        type: "movie",
        name: text(doc.title) || doc.identifier!,
        poster: "https://archive.org/services/img/" + encodeURIComponent(doc.identifier!),
        description: text(doc.description).slice(0, 500) || "Obra hospedada no Internet Archive. Consulte a licença na página original.",
        releaseInfo: text(doc.year),
        genres: [catalog.name, "Licença aberta"],
      }));
      return Response.json({ metas }, { headers: { "Cache-Control": "public, max-age=900" } });
    } catch {
      return Response.json({ metas: [] }, { status: 502 });
    }
  }

  if (path.startsWith("/meta/")) {
    const rawId = context.params.id ?? "";
    const identifier = rawId.startsWith("ia:") ? rawId.slice(3) : "";
    if (!/^[a-zA-Z0-9_-]{5,80}$/.test(identifier)) return Response.json({ meta: null }, { status: 400 });
    try {
      const item = await getItem(identifier);
      const md = item.metadata ?? {};
      const license = text(md.licenseurl);
      if (!allowedLicense(license)) return Response.json({ meta: null }, { status: 404 });
      return Response.json({
        meta: {
          id: itemId(identifier),
          type: "movie",
          name: text(md.title) || identifier,
          poster: "https://archive.org/services/img/" + encodeURIComponent(identifier),
          description: [text(md.description).replace(/<[^>]*>/g, " ").slice(0, 1400), "Licença declarada: " + license, "Fonte: https://archive.org/details/" + identifier].filter(Boolean).join("\n\n"),
          releaseInfo: text(md.year || md.date).slice(0, 20),
          genres: ["Internet Archive", "Licença aberta"],
          website: "https://archive.org/details/" + identifier,
        },
      }, { headers: { "Cache-Control": "public, max-age=1800" } });
    } catch {
      return Response.json({ meta: null }, { status: 502 });
    }
  }

  if (path.startsWith("/stream/")) {
    const rawId = context.params.id ?? "";
    const identifier = rawId.startsWith("ia:") ? rawId.slice(3) : "";
    if (!/^[a-zA-Z0-9_-]{5,80}$/.test(identifier)) return Response.json({ streams: [] }, { status: 400 });
    try {
      const item = await getItem(identifier);
      const md = item.metadata ?? {};
      if (!allowedLicense(md.licenseurl)) return Response.json({ streams: [] });
      const file = playableFile(item.files ?? []);
      if (!file?.name) return Response.json({ streams: [] });
      const directUrl = "https://archive.org/download/" + encodeURIComponent(identifier) + "/" +
        file.name.split("/").map(encodeURIComponent).join("/");
      return Response.json({
        streams: [{
          name: "Internet Archive • licença aberta",
          title: (file.name.endsWith(".mp4") ? "MP4" : "WebM") + " • arquivo direto",
          url: directUrl,
          behaviorHints: { notWebReady: false },
        }],
      }, { headers: { "Cache-Control": "public, max-age=1800" } });
    } catch {
      return Response.json({ streams: [] }, { status: 502 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

export const config = {
  path: ["/manifest.json", "/catalog/:type/:id.json", "/meta/:type/:id.json", "/stream/:type/:id.json"],
};
