const TOKEN_KEY = 'nextinvoice.token'

export function apiBase() {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (env) return env.replace(/\/+$/, '')
  if (import.meta.env.DEV) return ''
  return 'https://nextinvoice.onrender.com'
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

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

  const response = await fetch(`${apiBase()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.form ? options.form : options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = (await response.json().catch(() => null)) as T & { error?: string; code?: string; resetUrl?: string }
  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`) as Error & { code?: string }
    err.code = data?.code
    throw err
  }
  return data
}
