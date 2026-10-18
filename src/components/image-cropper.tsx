import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { create } from 'zustand'
import { cropToDataUrl, loadImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'

/**
 * Recorte de foto antes de salvar: arrasta para posicionar, pinça (ou o controle) para dar zoom.
 * Uso: `const url = await cropImage(file, { shape: 'circle', size: 320 })` — null se cancelar.
 */

interface CropOptions {
  /** Como a foto aparece no app: círculo (perfil) ou quadrado arredondado (capa). */
  shape?: 'circle' | 'rounded'
  size?: number
  title?: string
}

interface CropState {
  file: File | null
  options: CropOptions
  resolve: ((url: string | null) => void) | null
}

const useCropStore = create<CropState>(() => ({ file: null, options: {}, resolve: null }))

export function cropImage(file: File, options: CropOptions = {}): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Escolha um arquivo de imagem.'))
  return new Promise((resolve) => useCropStore.setState({ file, options, resolve }))
}

export function ImageCropHost() {
  const { file, options, resolve } = useCropStore()
  const close = (url: string | null) => {
    resolve?.(url)
    useCropStore.setState({ file: null, resolve: null })
  }
  return (
    <Sheet open={!!file} onClose={() => close(null)} title={options.title ?? 'Ajustar foto'} size="sm">
      {file && <Cropper key={`${file.name}-${file.size}-${file.lastModified}`} file={file} options={options} onDone={close} />}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

const MAX_ZOOM = 5
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Centro do recorte (em pixels da foto) e zoom (1 = o lado menor da foto inteiro). */
interface View {
  cx: number
  cy: number
  zoom: number
}

function fit(img: HTMLImageElement, v: View): View {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const zoom = clamp(v.zoom, 1, MAX_ZOOM)
  const half = Math.min(w, h) / (2 * zoom)
  return { zoom, cx: clamp(v.cx, half, w - half), cy: clamp(v.cy, half, h - half) }
}

/** Fotos em pé começam mais para o alto, onde costuma estar o rosto. */
function initialView(img: HTMLImageElement): View {
  return fit(img, { zoom: 1, cx: img.naturalWidth / 2, cy: img.naturalHeight > img.naturalWidth ? img.naturalHeight * 0.35 : img.naturalHeight / 2 })
}

function Cropper({ file, options, onDone }: { file: File; options: CropOptions; onDone: (url: string | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState(300)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const circle = (options.shape ?? 'circle') === 'circle'

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    let alive = true
    loadImage(file)
      .then((i) => {
        if (!alive) return
        if (!i.naturalWidth || !i.naturalHeight) throw new Error('Imagem vazia.')
        setImg(i)
        setView(initialView(i))
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Não foi possível abrir esta imagem.'))
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSide(el.clientWidth || 300)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = img && view ? (side / Math.min(img.naturalWidth, img.naturalHeight)) * view.zoom : 1
  const update = (fn: (v: View) => View) => img && setView((v) => (v ? fit(img, fn(v)) : v))
  const zoomTo = (zoom: number) => update((v) => ({ ...v, zoom }))

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setMoving(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev || !img) return
    const before = [...map.values()]
    map.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const after = [...map.values()]
    if (after.length === 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      update((v) => ({ ...v, cx: v.cx - dx / scale, cy: v.cy - dy / scale }))
    } else if (after.length >= 2) {
      // Pinça: zoom pela distância entre os dedos, arrasta pelo ponto médio.
      const dist = (p: { x: number; y: number }[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
      const mid = (p: { x: number; y: number }[]) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 })
      const ratio = dist(after) / dist(before)
      const m0 = mid(before)
      const m1 = mid(after)
      update((v) => ({ zoom: v.zoom * ratio, cx: v.cx - (m1.x - m0.x) / scale, cy: v.cy - (m1.y - m0.y) / scale }))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (!pointers.current.size) setMoving(false)
  }
  const onWheel = (e: React.WheelEvent) => update((v) => ({ ...v, zoom: v.zoom * Math.exp(-e.deltaY * 0.0015) }))
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 12 / scale
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      update((v) => ({ ...v, cx: v.cx + m[0], cy: v.cy + m[1] }))
    } else if (e.key === '+' || e.key === '=') zoomTo((view?.zoom ?? 1) * 1.15)
    else if (e.key === '-') zoomTo((view?.zoom ?? 1) / 1.15)
  }

  const save = async () => {
    if (!img || !view) return
    setBusy(true)
    try {
      const sideNatural = Math.min(img.naturalWidth, img.naturalHeight) / view.zoom
      onDone(cropToDataUrl(img, { x: view.cx - sideNatural / 2, y: view.cy - sideNatural / 2, side: sideNatural }, options.size ?? 320))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível usar esta foto.')
      setBusy(false)
    }
  }

  if (error) return <p className="py-8 text-center text-[14px] text-rose-ink">{error}</p>

  return (
    <div className="space-y-4">
      <div
        ref={box}
        role="img"
        tabIndex={0}
        aria-label="Arraste para posicionar a foto"
        className="relative mx-auto aspect-square w-full max-w-[340px] cursor-grab touch-none overflow-hidden rounded-[22px] bg-surface-3 outline-none select-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      >
        {src && img && view && (
          <img
            src={src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: side / 2 - view.cx * scale, top: side / 2 - view.cy * scale, width: img.naturalWidth * scale, height: img.naturalHeight * scale }}
          />
        )}
        {/* Grade enquanto arrasta, para alinhar o rosto */}
        <div className={cn('pointer-events-none absolute inset-0 transition-opacity', moving ? 'opacity-100' : 'opacity-0')}>
          {[1, 2].map((i) => (
            <div key={`v${i}`} className="absolute inset-y-0 w-px bg-white/45" style={{ left: `${(i * 100) / 3}%` }} />
          ))}
          {[1, 2].map((i) => (
            <div key={`h${i}`} className="absolute inset-x-0 h-px bg-white/45" style={{ top: `${(i * 100) / 3}%` }} />
          ))}
        </div>
        {/* Como vai aparecer no app */}
        <div
          className={cn('pointer-events-none absolute inset-0 ring-2 ring-white/85 ring-inset', circle ? 'rounded-full' : 'rounded-[22px]')}
          style={circle ? { boxShadow: '0 0 0 999px rgb(13 12 34 / 0.55)' } : undefined}
        />
      </div>

      <div className="mx-auto flex max-w-[340px] items-center gap-3">
        <button type="button" aria-label="Diminuir zoom" onClick={() => zoomTo((view?.zoom ?? 1) / 1.2)} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <ZoomOut className="size-[18px]" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={view?.zoom ?? 1}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--primary)]"
        />
        <button type="button" aria-label="Aumentar zoom" onClick={() => zoomTo((view?.zoom ?? 1) * 1.2)} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <ZoomIn className="size-[18px]" />
        </button>
        <button type="button" aria-label="Recomeçar" onClick={() => img && setView(initialView(img))} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <RotateCcw className="size-[17px]" />
        </button>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={() => onDone(null)}>
          Cancelar
        </Button>
        <Button className="flex-1" icon={Check} loading={busy} disabled={!img} onClick={save}>
          Usar foto
        </Button>
      </div>
    </div>
  )
}
