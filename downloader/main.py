import glob
import os
import re
import tempfile
import uuid

import httpx
import yt_dlp
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Serviço baixador: recebe uma URL (YouTube, SoundCloud…) e devolve o áudio já
# convertido e enviado para o Supabase Storage. Roda em qualquer host com Docker
# (Render free tier, VPS, Railway…). Nunca guarda arquivos em disco: tudo é temporário.

app = FastAPI(title="baixador")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

SECRET = os.environ.get("DOWNLOADER_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = os.environ.get("BUCKET", "ensaios")

MIME = {"mp3": "audio/mpeg", "wav": "audio/wav", "flac": "audio/flac"}


class DownloadRequest(BaseModel):
    url: str
    format: str = "mp3"


def auth(authorization: str = Header(default="")):
    if not SECRET or authorization != f"Bearer {SECRET}":
        raise HTTPException(status_code=401, detail="não autorizado")


def safe(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "audio"


def upload(file_path: str, key: str, content_type: str) -> None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=500, detail="Supabase não configurado")
    with open(file_path, "rb") as f:
        data = f.read()
    r = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{key}",
        headers={"Authorization": f"Bearer {SUPABASE_SERVICE_KEY}", "Content-Type": content_type},
        content=data,
        timeout=180,
    )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"erro no storage ({r.status_code}): {r.text[:200]}")


@app.get("/")
def health():
    return {"ok": True}


@app.post("/download")
def download(req: DownloadRequest, _=Depends(auth)):
    url = req.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="link inválido")
    fmt = req.format if req.format in MIME else "mp3"
    # MP3 em 320 kbps (boa qualidade para separação de stems depois); wav/flac são lossless.
    quality = "320" if fmt == "mp3" else "0"

    try:
        with tempfile.TemporaryDirectory() as tmp:
            outtmpl = os.path.join(tmp, "audio.%(ext)s")
            opts = {
                "format": "bestaudio/best",
                "outtmpl": outtmpl,
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "socket_timeout": 30,
                "extractor_args": {"youtube": {"player_client": ["android", "ios", "mweb", "tv_embedded"]}},
                "postprocessors": [
                    {"key": "FFmpegExtractAudio", "preferredcodec": fmt, "preferredquality": quality}
                ],
            }
            # Cookies do navegador ajudam quando o YouTube bloqueia IP de datacenter.
            cookies = os.environ.get("YOUTUBE_COOKIES", "").strip()
            if cookies:
                cookie_path = os.path.join(tmp, "cookies.txt")
                with open(cookie_path, "w", encoding="utf-8") as f:
                    f.write(cookies)
                opts["cookiefile"] = cookie_path
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)

            files = glob.glob(os.path.join(tmp, f"audio.{fmt}"))
            if not files:
                files = [f for f in glob.glob(os.path.join(tmp, "audio.*")) if not f.endswith((".part", ".ytdl", ".webm", ".m4a"))]
            if not files:
                raise HTTPException(status_code=500, detail="não foi possível converter o áudio")

            path = files[0]
            title = (info.get("title") or "audio").strip()
            key = f"musicas/{safe(title)}-{uuid.uuid4().hex[:8]}.{fmt}"
            upload(path, key, MIME[fmt])
            return {
                "storagePath": key,
                "mimeType": MIME[fmt],
                "title": title,
                "durationSec": info.get("duration"),
                "sizeBytes": os.path.getsize(path),
            }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")
