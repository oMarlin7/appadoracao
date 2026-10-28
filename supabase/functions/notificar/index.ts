// Supabase Edge Function · notificar
//
// Notificações no celular (Web Push) para a equipe:
//   { action: 'rodada' }  → chamada a cada minuto pelo agendador do banco (pg_cron + pg_net, com o
//                           segredo de push_config): confere escala, votação, setlist, ensaio e
//                           avisos e envia o que for novo (regras.ts)
//   { action: 'chave' }   → chave pública VAPID, para o app inscrever o aparelho (membro logado)
//   { action: 'teste' }   → notificação de teste para os aparelhos de quem pediu (membro logado)
//   { action: 'remover', endpoint } → tira este aparelho da conta de quem pediu (membro logado)
//
// Publicar: supabase functions deploy notificar --no-verify-jwt
// As chaves VAPID são criadas aqui na primeira vez e ficam em push_config (sem acesso pelo app).

import { planejar, testPayload, type AnnouncementRow, type Payload, type PollRow, type ProfileRow, type ServiceRow, type State } from './regras.ts'
import { generateVapidKeys, sendPush, type Subscription, type VapidKeys } from './webpush.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const SUBJECT = 'mailto:notificacoes@appadoracao.app'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''

function envKey(listVar: string, legacyVar: string): string {
  try {
    const key = JSON.parse(Deno.env.get(listVar) ?? '{}').default
    if (key) return key
  } catch {
    /* usa a chave antiga */
  }
  return Deno.env.get(legacyVar) ?? ''
}
const SERVICE_KEY = envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
const PUBLIC_KEY = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')

/** PostgREST com a chave de serviço (a função lê a equipe toda e grava o registro de envios). */
async function rest<T>(path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' }
  // Chaves novas (sb_secret_…) vão só no apikey; a antiga (JWT) também no Authorization.
  if (!SERVICE_KEY.startsWith('sb_')) headers.Authorization = `Bearer ${SERVICE_KEY}`
  if (init.prefer) headers.Prefer = init.prefer
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const inList = (ids: string[]) => `(${ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`

/** Id de quem chama (membro logado), conferido no Auth do próprio projeto. */
async function caller(req: Request): Promise<string | null> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1]
  if (!token || token.startsWith('sb_')) return null
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  return ((await res.json()) as { id?: string }).id ?? null
}

interface Config {
  vapid_public: string | null
  vapid_private: JsonWebKey | null
  cron_secret: string
}

async function config(): Promise<Config> {
  const rows = await rest<Config[]>('push_config?id=eq.1&select=vapid_public,vapid_private,cron_secret')
  if (!rows[0]) throw new Error('push_config vazio: rode a migração v6')
  return rows[0]
}

/** Cria as chaves VAPID na primeira vez (se duas rodadas criarem juntas, vale a que gravou primeiro). */
async function vapidKeys(c: Config): Promise<VapidKeys> {
  if (c.vapid_public && c.vapid_private) return { publicKey: c.vapid_public, privateJwk: c.vapid_private }
  const k = await generateVapidKeys()
  await rest('push_config?id=eq.1&vapid_public=is.null', { method: 'PATCH', body: JSON.stringify({ vapid_public: k.publicKey, vapid_private: k.privateJwk }) })
  const again = await config()
  return { publicKey: again.vapid_public!, privateJwk: again.vapid_private! }
}

interface SubRow extends Subscription {
  user_id: string
}

/** Envia para todos os aparelhos das pessoas; apaga os endereços que não existem mais. */
async function deliver(sends: Array<{ userId: string; payload: Payload; urgency: 'normal' | 'high' }>, subs: SubRow[], keys: VapidKeys) {
  const byUser = new Map<string, SubRow[]>()
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])
  const jobs = sends.flatMap((x) => (byUser.get(x.userId) ?? []).map((sub) => ({ sub, ...x })))
  let sent = 0
  let failed = 0
  const gone: string[] = []
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(
      jobs.slice(i, i + 10).map(async (j) => {
        try {
          const r = await sendPush(j.sub, JSON.stringify(j.payload), keys, { subject: SUBJECT, urgency: j.urgency, ttl: 12 * 3600 })
          if (r.ok) sent++
          else {
            failed++
            if (r.gone) gone.push(j.sub.endpoint)
            else console.warn('push recusado', r.status, new URL(j.sub.endpoint).host)
          }
        } catch (e) {
          failed++
          console.warn('push falhou', e instanceof Error ? e.message : e)
        }
      }),
    )
  }
  if (gone.length) await rest(`push_subscriptions?endpoint=in.${encodeURIComponent(inList(gone))}`, { method: 'DELETE' })
  return { sent, failed, removed: gone.length }
}

async function loadState(now: Date): Promise<State> {
  const since = new Date(now.getTime() - 2 * 86400_000).toISOString().slice(0, 10)
  const [teamRows, profiles, services, polls, announcements, notified] = await Promise.all([
    rest<State['team'][]>('team_settings?id=eq.team&select=selection_mode,voting_picks,voting_votes,timezone'),
    rest<ProfileRow[]>('profiles?select=id,name,functions,notify_prefs'),
    rest<ServiceRow[]>(`services?date=gte.${since}&select=id,title,kind,date,time,notes,items,team,updated_at`),
    rest<PollRow[]>('song_polls?select=id,mode,picks,max_votes,opens_at,closes_at,applied_at'),
    rest<AnnouncementRow[]>(`announcements?created_at=gte.${new Date(now.getTime() - 86400_000).toISOString()}&select=id,title,body,audience,ends_on,created_by,created_at`),
    rest<Array<{ key: string }>>('push_log?key=like.setlist:*&select=key'),
  ])
  const ids = services.map((s) => s.id)
  const songIds = [...new Set(services.flatMap((s) => (s.items ?? []).map((i) => i.songId)))]
  const [votes, suggestions, songs] = await Promise.all([
    ids.length ? rest<State['votes']>(`votes?service_id=in.${encodeURIComponent(inList(ids))}&select=service_id,user_id`) : [],
    ids.length ? rest<Array<{ service_id: string }>>(`suggestions?service_id=in.${encodeURIComponent(inList(ids))}&status=eq.pendente&select=service_id`) : [],
    songIds.length ? rest<Array<{ id: string; title: string }>>(`songs?id=in.${encodeURIComponent(inList(songIds))}&select=id,title`) : [],
  ])
  return {
    now,
    team: teamRows[0] ?? { selection_mode: null, voting_picks: null, voting_votes: null, timezone: null },
    profiles,
    services,
    polls,
    votes,
    suggested: new Set(suggestions.map((s) => s.service_id)),
    songTitles: new Map(songs.map((s) => [s.id, s.title])),
    announcements,
    setlistNotified: new Set(notified.map((n) => n.key.split(':')[1])),
  }
}

async function rodada() {
  const now = new Date()
  const c = await config()
  const keys = await vapidKeys(c)
  // Primeira rodada: marca o que já existe como avisado, para não disparar o passado de uma vez.
  const baseline = (await rest<unknown[]>('push_log?key=eq.baseline&select=key')).length > 0
  const planned = planejar(await loadState(now), { ignoreQuiet: !baseline })
  const claimed = planned.length
    ? await rest<Array<{ key: string }>>('push_log?on_conflict=key', {
        method: 'POST',
        prefer: 'resolution=ignore-duplicates,return=representation',
        body: JSON.stringify(planned.map((p) => ({ key: p.key }))),
      })
    : []
  if (!baseline) {
    await rest('push_log', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: JSON.stringify([{ key: 'baseline' }]) })
    return { baseline: true, marked: claimed.length }
  }

  const fresh = new Set(claimed.map((r) => r.key))
  const sends = planned
    .filter((p) => fresh.has(p.key))
    .flatMap((p) => p.recipients.map((r) => ({ ...r, urgency: p.kind === 'escala' || p.kind === 'avisos' ? ('high' as const) : ('normal' as const) })))
  if (now.getUTCMinutes() === 0) await rest(`push_log?created_at=lt.${new Date(now.getTime() - 120 * 86400_000).toISOString()}&key=neq.baseline`, { method: 'DELETE' })
  if (!sends.length) return { planned: planned.length, sent: 0 }
  const subs = await rest<SubRow[]>(`push_subscriptions?user_id=in.${encodeURIComponent(inList([...new Set(sends.map((s) => s.userId))]))}&select=endpoint,user_id,p256dh,auth`)
  return { planned: planned.length, notifications: fresh.size, ...(await deliver(sends, subs, keys)) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  try {
    const body = await req.json().catch(() => ({}))
    if (body.action === 'rodada') {
      const c = await config()
      if (!c.cron_secret || req.headers.get('x-cron-secret') !== c.cron_secret) return json({ error: 'não autorizado' }, 401)
      return json(await rodada())
    }
    const userId = await caller(req)
    if (!userId) return json({ error: 'entre na sua conta' }, 401)
    if (body.action === 'chave') return json({ publicKey: (await vapidKeys(await config())).publicKey })
    if (body.action === 'teste') {
      const keys = await vapidKeys(await config())
      const [me] = await rest<Array<{ name: string }>>(`profiles?id=eq.${encodeURIComponent(userId)}&select=name`)
      const subs = await rest<SubRow[]>(`push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=endpoint,user_id,p256dh,auth`)
      return json(await deliver([{ userId, payload: testPayload(me?.name ?? ''), urgency: 'high' }], subs, keys))
    }
    if (body.action === 'remover') {
      await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(String(body.endpoint ?? ''))}&user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' })
      return json({ ok: true })
    }
    return json({ error: 'ação desconhecida' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'erro' }, 500)
  }
})
