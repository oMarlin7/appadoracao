import { AudioLines, ListMusic, Megaphone, MicVocal, Vote, type LucideIcon } from 'lucide-react'
import { backend, isDemo } from './backend'
import { readStorage, writeStorage } from './storage'
import type { Pastel } from './taxonomy'

/**
 * Notificações no celular (Web Push). O aparelho se inscreve com a chave da equipe e o servidor
 * (função notificar) envia escala, votação, setlist, ensaio e avisos do líder. O service worker
 * mostra a notificação (public/push-sw.js).
 */

export type NotifyKind = 'escala' | 'votacao' | 'setlist' | 'ensaio' | 'avisos'
export type NotifyPrefs = Partial<Record<NotifyKind, boolean>>

export const NOTIFY_KINDS: Array<{ id: NotifyKind; label: string; hint: string; icon: LucideIcon; color: Pastel }> = [
  { id: 'escala', label: 'Escala', hint: 'Quando você entrar na escala', icon: MicVocal, color: 'lavender' },
  { id: 'votacao', label: 'Votação', hint: 'Quando abrir e nas últimas horas', icon: Vote, color: 'butter' },
  { id: 'setlist', label: 'Setlist', hint: 'Quando as músicas forem definidas', icon: ListMusic, color: 'sky' },
  { id: 'ensaio', label: 'Ensaio', hint: 'No dia do ensaio', icon: AudioLines, color: 'mint' },
  { id: 'avisos', label: 'Avisos do líder', hint: 'Mensagens para a equipe', icon: Megaphone, color: 'orchid' },
]

export const wantsKind = (prefs: NotifyPrefs | null | undefined, kind: NotifyKind) => prefs?.[kind] !== false

/**
 * on/off: pode ativar · ios-install: no iPhone só funciona com o app instalado na tela de início
 * denied: bloqueado nos ajustes · unsupported: navegador sem notificações
 */
export type PushStatus = 'on' | 'off' | 'denied' | 'ios-install' | 'unsupported'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const DEMO_KEY = 'adoracao:push-demo'

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function pushStatus(): Promise<PushStatus> {
  if (isIos() && !installed()) return 'ios-install'
  if (!('Notification' in window) || !('serviceWorker' in navigator) || (!isDemo && !('PushManager' in window))) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  if (isDemo) return readStorage('local', DEMO_KEY) === '1' ? 'on' : 'off'
  const sub = await (await registration())?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i])

async function save(sub: PushSubscription) {
  const j = sub.toJSON()
  await backend.rpc('registrar_aparelho', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent })
}

/** Pede a permissão e inscreve o aparelho. */
export async function enablePush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  if (isDemo) {
    writeStorage('local', DEMO_KEY, '1')
    return 'on'
  }
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
  if (!reg) throw new Error('Abra o app instalado para ativar as notificações.')
  const { publicKey } = await backend.invoke<{ publicKey: string }>('notificar', { action: 'chave' })
  const key = keyBytes(publicKey)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await save(sub)
  return 'on'
}

export async function disablePush(): Promise<PushStatus> {
  if (isDemo) {
    writeStorage('local', DEMO_KEY, '0')
    return 'off'
  }
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) {
    await backend.invoke('notificar', { action: 'remover', endpoint: sub.endpoint }).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

/** Ao abrir o app: mantém o aparelho ligado à conta de quem está usando (e o endereço em dia). */
export async function syncPush() {
  if (isDemo || !('Notification' in window) || Notification.permission !== 'granted') return
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) await save(sub)
}

/** Ao sair da conta: o aparelho para de receber os avisos dessa pessoa. */
export async function forgetDevice() {
  if (isDemo) return
  const sub = await (await registration())?.pushManager.getSubscription().catch(() => null)
  if (sub) await backend.invoke('notificar', { action: 'remover', endpoint: sub.endpoint }).catch(() => {})
}

/** Notificação de teste; devolve quantos aparelhos receberam. */
export async function sendTestPush(name: string): Promise<number> {
  if (!isDemo) {
    const r = await backend.invoke<{ sent: number }>('notificar', { action: 'teste' })
    return r.sent
  }
  // Demonstração: mostra direto neste aparelho, igual chegaria do servidor.
  const title = `Tudo certo, ${name.trim().split(/\s+/)[0] || 'você'}!`
  const options: NotificationOptions & { image?: string } = {
    body: 'As notificações do Adoração estão ativadas neste aparelho.',
    icon: '/pwa-192x192.png',
    badge: '/notificacoes/badge.png',
    image: '/notificacoes/teste.jpg',
    tag: 'teste',
    data: { url: '/perfil' },
  }
  const reg = await registration()
  if (reg) await reg.showNotification(title, options)
  else new Notification(title, options)
  return 1
}
