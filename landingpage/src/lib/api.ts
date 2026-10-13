const TOKEN_KEY = 'nextinvoice.token'

const HOME = 'https://api.mynextinvoice.com'
// The address the API had before it moved. It forwards to the same server, and every network
// already knows it; a resolver can take a while to learn a new name such as the one above.
const FORWARDER = 'https://nextinvoice.onrender.com'

export function apiBase() {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (env) return env.replace(/\/+$/, '')
  if (import.meta.env.DEV) return ''
  return HOME
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

const UNREACHABLE: Record<string, string> = {
  sq: 'Nuk u arrit serveri. Kontrollo internetin dhe provo përsëri.',
  en: 'Could not reach the server. Check your connection and try again.',
  it: 'Server non raggiungibile. Controlla la connessione e riprova.',
}

function unreachable() {
  const lang = localStorage.getItem('nextinvoice.lang') || 'sq'
  const err = new Error(UNREACHABLE[lang] || UNREACHABLE.sq) as Error & { code?: string }
  err.code = 'NETWORK'
  return err
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Sends requests to the API, switching to the forwarding address when the API's own address
 * cannot be reached from this network. A request is only repeated on the other address after a
 * plain health check shows the first address is unreachable, so nothing is ever submitted twice.
 */
export function createTransport(home: string, forwarder: string, fetcher: Fetch) {
  let base = home
  return async function send(path: string, init?: RequestInit) {
    try {
      return await fetcher(`${base}${path}`, init)
    } catch (failure) {
      if (base !== home || !forwarder) throw failure
      const homeIsUp = await fetcher(`${home}/health`).then((res) => res.ok, () => false)
      if (homeIsUp) throw failure
      const forwarderIsUp = await fetcher(`${forwarder}/health`).then((res) => res.ok, () => false)
      if (!forwarderIsUp) throw failure
      base = forwarder
      return fetcher(`${base}${path}`, init)
    }
  }
}

const send = createTransport(apiBase(), apiBase() === HOME ? FORWARDER : '', (url, init) => fetch(url, init))

type ApiOptions = {
  method?: string
  body?: unknown
  token?: string | null
  form?: FormData
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = options.token === undefined ? getToken() : options.token
  if (token) headers.Authorization = `Bearer ${token}`
  if (!options.form) headers['Content-Type'] = 'application/json'

  const response = await send(path, {
    method: options.method || 'GET',
    headers,
    body: options.form ? options.form : options.body ? JSON.stringify(options.body) : undefined,
  }).catch(() => {
    throw unreachable()
  })
  const data = (await response.json().catch(() => null)) as T & { error?: string; code?: string; resetUrl?: string }
  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`) as Error & { code?: string }
    err.code = data?.code
    throw err
  }
  return data
}
