import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from '../lib/api'

export type User = {
  id: string
  email: string
  createdAt?: string
  plan?: 'free' | 'premium'
  billingSource?: string | null
  planExpiresAt?: string | null
}

type AuthValue = {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, extras?: { language?: string; industry?: string }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

const USER_KEY = 'nextinvoice.user'

function rememberedUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null
  } catch {
    return null
  }
}

function rememberUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [loading, setLoading] = useState(Boolean(getToken()))

  useEffect(() => {
    const current = getToken()
    if (!current) {
      setLoading(false)
      return
    }
    let retry: number | undefined
    let attempts = 0
    const check = () =>
      api<{ user: User }>('/api/auth/me', { token: current })
        .then((res) => {
          rememberUser(res.user)
          setUser(res.user)
          setTokenState(current)
        })
        .catch((err: { status?: number }) => {
          if (err.status === 401) {
            // The server no longer accepts this session.
            setToken(null)
            rememberUser(null)
            setUser(null)
            setTokenState(null)
            return
          }
          // The server could not be reached or is restarting. That says nothing about the session:
          // stay signed in as the person last seen on this browser, and ask again shortly.
          setUser((prev) => prev || rememberedUser())
          attempts += 1
          if (attempts < 6) retry = window.setTimeout(check, 5000)
        })
        .finally(() => setLoading(false))
    void check()
    return () => window.clearTimeout(retry)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      token: null,
    })
    setToken(res.token)
    setTokenState(res.token)
    rememberUser(res.user)
    setUser(res.user)
  }, [])

  const signup = useCallback(async (email: string, password: string, extras?: { language?: string; industry?: string }) => {
    const res = await api<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, language: extras?.language, industry: extras?.industry },
      token: null,
    })
    setToken(res.token)
    setTokenState(res.token)
    rememberUser(res.user)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    rememberUser(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const current = getToken()
    if (!current) {
      setUser(null)
      return
    }
    const res = await api<{ user: User }>('/api/auth/me', { token: current })
    rememberUser(res.user)
    setUser(res.user)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout, refreshUser }),
    [user, token, loading, login, signup, logout, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
