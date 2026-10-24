# Baixador (yt-dlp + FFmpeg)

Micro-serviço que recebe uma URL (YouTube, SoundCloud…) e devolve o áudio convertido,
já enviado para o Supabase Storage. É usado pelo app para "baixar a música" e deixar
disponível para tocar (e, no futuro, separar instrumentos/vozes).

## Como funciona

`POST /download` com:

```json
{ "url": "https://www.youtube.com/watch?v=…", "format": "mp3" }
```

- Baixa o melhor áudio com `yt-dlp`.
- Converte com FFmpeg para **MP3 320 kbps** (ou `wav`/`flac`).
- Envia para o bucket do Supabase (`ensaios` por padrão).
- Responde:

```json
{ "storagePath": "musicas/titulo-abc123.mp3", "mimeType": "audio/mpeg", "title": "…", "durationSec": 240, "sizeBytes": 9600000 }
```

## Deploy no Render (free tier)

1. Suba esta pasta para o GitHub (já está no repositório do app).
2. No [Render Dashboard](https://dashboard.render.com) → **New → Web Service** → conecte o repo → aponte para a pasta `downloader` (ou use o `render.yaml` via **Blueprint**).
3. Escolha o plano **Free**.
4. Configure as variáveis de ambiente:
   - `DOWNLOADER_SECRET` → gere um valor aleatório (ou deixe o Blueprint gerar).
   - `SUPABASE_URL` → ex.: `https://gqocxdbpgjcqjzckllvr.supabase.co`.
   - `SUPABASE_SERVICE_KEY` → a **service_role** key (Dashboard do Supabase → Project Settings → API → service_role).
   - `BUCKET` → `ensaios` (ou o bucket que preferir).
5. Anote a URL do serviço (ex.: `https://baixador.onrender.com`).

> O free tier dorme após ~15 min sem uso; a primeira chamada demora 30–60 s (cold start).
> Depois da primeira, fica rápido.

## Local (opcional)

```bash
docker build -t baixador .
docker run --rm -p 8000:8000 \
  -e DOWNLOADER_SECRET=segredo \
  -e SUPABASE_URL=https://SEU.supabase.co \
  -e SUPABASE_SERVICE_KEY=... \
  baixador
```
