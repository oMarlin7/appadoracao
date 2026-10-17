/**
 * Fotos escolhidas no aparelho viram imagens pequenas (quadradas, JPEG) antes de salvar:
 * cabem no banco junto com o perfil/música e funcionam offline.
 */

function loadImage(file: Blob): Promise<HTMLImageElement> {
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

/** Recorta no centro e reduz para `size`×`size`. */
export async function squareImageDataUrl(file: Blob, size = 256, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  const img = await loadImage(file)
  const side = Math.min(img.naturalWidth, img.naturalHeight)
  if (!side) throw new Error('Imagem vazia.')
  const canvas = document.createElement('canvas')
  const out = Math.min(size, side)
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out)
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
