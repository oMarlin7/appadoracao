/**
 * Fotos escolhidas no aparelho passam pelo recorte (components/image-cropper) e viram imagens
 * pequenas (quadradas, JPEG) antes de salvar: cabem no banco junto com o perfil/música e funcionam offline.
 */

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível abrir esta imagem.'))
    }
    img.src = url
  })
}

/** Recorta o quadrado escolhido (em pixels da foto) e reduz para no máximo `size`×`size`. */
export function cropToDataUrl(img: HTMLImageElement, area: { x: number; y: number; side: number }, size = 320, quality = 0.85): string {
  const canvas = document.createElement('canvas')
  const out = Math.max(1, Math.round(Math.min(size, area.side)))
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.side, area.side, 0, 0, out, out)
  return canvas.toDataURL('image/jpeg', quality)
}

/** Abre o seletor de arquivos do aparelho (galeria/câmera no celular). */
export function pickFile(accept: string, opts: { capture?: boolean } = {}): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    if (opts.capture) input.setAttribute('capture', 'user')
    input.style.display = 'none'
    let settled = false
    const done = (f: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(f)
    }
    input.addEventListener('change', () => done(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => done(null))
    document.body.appendChild(input)
    input.click()
  })
}
