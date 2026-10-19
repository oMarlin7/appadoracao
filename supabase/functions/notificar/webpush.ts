// Web Push (RFC 8030, 8291 e 8292) só com WebCrypto: roda no Deno da função e no Node dos testes.
//
// Cada aparelho que ativou as notificações tem um endereço no serviço de push do celular
// (Google no Android, Apple no iPhone) e duas chaves. A mensagem vai cifrada para aquele
// aparelho (aes128gcm) e assinada com a chave VAPID da equipe, que identifica quem envia.

const enc = new TextEncoder()
type Bytes = Uint8Array<ArrayBuffer>

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Bytes {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// ---------------------------------------------------------------------------
// Chaves VAPID
// ---------------------------------------------------------------------------

export interface VapidKeys {
  /** Chave pública crua (65 bytes) em base64url: é a que o app usa para se inscrever. */
  publicKey: string
  privateJwk: JsonWebKey
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: b64urlEncode(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }
}

/** Cabeçalho Authorization (RFC 8292): um JWT ES256 para o serviço de push daquele aparelho. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const json = (o: unknown) => b64urlEncode(enc.encode(JSON.stringify(o)))
  const unsigned = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`
  const { d, x, y } = keys.privateJwk
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // O WebCrypto já devolve a assinatura no formato do JWS (r || s, 64 bytes).
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${keys.publicKey}`
}

// ---------------------------------------------------------------------------
// Cifra da mensagem (aes128gcm, RFC 8291)
// ---------------------------------------------------------------------------

export interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
}

/** `local` e `salt` só são passados nos testes; normalmente são novos a cada mensagem. */
export async function encryptPayload(
  sub: Pick<Subscription, 'p256dh' | 'auth'>,
  payload: string,
  local?: CryptoKeyPair,
  salt: Bytes = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  const pair = local ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, pair.privateKey, 256))

  const prkKey = await hmac(authSecret, ecdh)
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12)

  // Um registro só: a mensagem + o delimitador 0x02 de "último registro".
  const plain = concat(enc.encode(payload), new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, cipher)
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export interface SendOptions {
  /** Contato de quem envia (exigido pelos serviços de push). */
  subject: string
  /** Por quanto tempo o serviço guarda a mensagem se o celular estiver desligado (segundos). */
  ttl?: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
}

export interface SendResult {
  ok: boolean
  status: number
  /** O aparelho não existe mais (desinstalou, trocou de celular): pode apagar o endereço. */
  gone: boolean
}

export async function sendPush(sub: Subscription, payload: string, keys: VapidKeys, opts: SendOptions): Promise<SendResult> {
  const body = await encryptPayload(sub, payload)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, opts.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 12 * 3600),
      Urgency: opts.urgency ?? 'normal',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  await res.body?.cancel()
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 }
}
