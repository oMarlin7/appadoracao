import { Minus, Plus, RotateCcw, Users, User } from 'lucide-react'
import { allKeys, keyNameFor, parseKey, prettyAccidentals, sameKey, solfegeName, suggestCapo, type AccidentalPref } from '@/lib/music/theory'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'

export function KeyGrid({
  value,
  onChange,
  minor,
  pref = 'auto',
  marks = {},
}: {
  value: string | null
  onChange: (key: string) => void
  minor: boolean
  pref?: AccidentalPref
  marks?: Record<string, string>
}) {
  const keys = allKeys(minor, pref)
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {keys.map((k) => {
        const active = sameKey(k, value)
        const mark = Object.entries(marks).find(([mk]) => sameKey(mk, k))?.[1]
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={active}
            className={cn(
              'relative flex h-16 flex-col items-center justify-center rounded-2xl border text-center transition-all active:scale-95',
              active ? 'border-transparent bg-primary text-primary-ink shadow-float' : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            <span className="text-[17px] font-extrabold tracking-tight">{prettyAccidentals(k)}</span>
            <span className={cn('text-[11px] font-semibold', active ? 'opacity-80' : 'text-muted')}>{solfegeName(k)}</span>
            {mark && (
              <span
                className={cn(
                  'absolute -top-1.5 right-1 rounded-full px-1.5 text-[9.5px] leading-4 font-extrabold tracking-wide uppercase',
                  active ? 'bg-white text-primary' : 'bg-butter text-butter-ink',
                )}
              >
                {mark}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function KeyPickerSheet({
  open,
  onClose,
  value,
  onChange,
  originalKey,
  teamKey,
  myKey,
  serviceKey,
  capo,
  onCapoChange,
  onSaveTeam,
  onSaveMine,
  pref,
}: {
  open: boolean
  onClose: () => void
  value: string
  onChange: (key: string) => void
  originalKey: string
  teamKey?: string | null
  myKey?: string | null
  serviceKey?: string | null
  capo: number
  onCapoChange: (capo: number) => void
  onSaveTeam?: () => void
  onSaveMine?: () => void
  pref: AccidentalPref
}) {
  const k = parseKey(value)
  const minor = k?.minor ?? false
  const marks: Record<string, string> = {}
  marks[originalKey] = 'Original'
  if (teamKey) marks[teamKey] = sameKey(teamKey, originalKey) ? 'Orig. · Equipe' : 'Equipe'
  if (myKey) marks[myKey] = 'Meu'
  if (serviceKey) marks[serviceKey] = 'Culto'
  const step = (d: number) => k && onChange(keyNameFor(k.root + d, k.minor, pref))
  const capoTip = suggestCapo(value)

  return (
    <Sheet open={open} onClose={onClose} title="Tom da música" description="Escolha o tom e a cifra inteira é transposta na hora.">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-surface-2 p-2">
        <Button variant="outline" size="md" icon={Minus} onClick={() => step(-1)} className="bg-surface">
          ½ tom
        </Button>
        <div className="text-center">
          <div className="text-[28px] leading-none font-extrabold tracking-tight text-ink">{prettyAccidentals(value)}</div>
          <div className="mt-1 text-[12px] font-semibold text-muted">{solfegeName(value)}</div>
        </div>
        <Button variant="outline" size="md" icon={Plus} onClick={() => step(1)} className="bg-surface">
          ½ tom
        </Button>
      </div>

      <KeyGrid value={value} onChange={onChange} minor={minor} pref={pref} marks={marks} />

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13px] font-bold text-ink-2">Capotraste</span>
          {capoTip && capo === 0 && (
            <button type="button" className="text-[12.5px] font-semibold text-primary" onClick={() => onCapoChange(capoTip.capo)}>
              Sugestão: casa {capoTip.capo} (forma de {prettyAccidentals(capoTip.shapeKey)})
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {Array.from({ length: 10 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onCapoChange(i)}
              className={cn(
                'h-10 min-w-11 shrink-0 rounded-xl border px-3 text-[13.5px] font-bold transition-all',
                capo === i ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {i === 0 ? 'Sem' : `${i}ª`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {onSaveTeam && (
          <Button variant="soft" icon={Users} onClick={onSaveTeam} disabled={sameKey(teamKey ?? originalKey, value) && !!teamKey}>
            Salvar como tom da equipe
          </Button>
        )}
        {onSaveMine && (
          <Button variant="outline" icon={User} onClick={onSaveMine} disabled={sameKey(myKey, value)}>
            Salvar como meu tom
          </Button>
        )}
        {!sameKey(value, originalKey) && (
          <Button variant="ghost" icon={RotateCcw} onClick={() => onChange(originalKey)} className="sm:col-span-2">
            Voltar ao tom original ({prettyAccidentals(originalKey)})
          </Button>
        )}
      </div>
    </Sheet>
  )
}
