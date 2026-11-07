# AIO Public Domain Addon

Addon comunitário compatível com Stremio/AIOStreams. Ele pesquisa o Internet Archive e só exibe itens cuja metadata declare uma destas licenças abertas:

- CC0 1.0
- Public Domain Mark 1.0
- CC BY 3.0 ou 4.0
- CC BY-SA 3.0 ou 4.0

A licença é verificada novamente antes de apresentar metadata e streams. O addon não hospeda, copia nem transcodifica vídeos: fornece links diretos para arquivos MP4/WebM do Internet Archive.

## Endpoints

- `/manifest.json`
- `/catalog/movie/ia_open_movies.json`
- `/catalog/movie/ia_animation.json`
- `/catalog/movie/ia_anime.json`
- `/catalog/movie/ia_documentaries.json`

## Deploy na Netlify

1. Conecte este repositório ao projeto Netlify `aio-public-domain-addon`.
2. Build command: vazio (não há etapa de build).
3. Publish directory: `public`.
4. Functions directory: `netlify/functions`.
5. Publique o site e deixe o acesso público, sem SSO ou senha.

Após o deploy, teste `https://SEU-SITE.netlify.app/manifest.json`.

## Limitações importantes

- Este MVP cataloga **filmes/vídeos individuais**, não organiza séries em temporadas e episódios.
- A licença é a declaração de quem enviou o item ao Internet Archive; isso não equivale a uma auditoria jurídica independente da titularidade dos direitos.
- A disponibilidade de áudio dublado em português não é garantida. O addon não inventa etiquetas de idioma/dublagem.
- Só arquivos MP4 e WebM são oferecidos. Alguns itens licenciados podem não ter arquivo compatível e, nesse caso, não terão stream.
- A disponibilidade e a velocidade dependem do Internet Archive e da conexão do usuário.
- Sem Debrid, Usenet, torrent/P2P ou fontes privadas.
