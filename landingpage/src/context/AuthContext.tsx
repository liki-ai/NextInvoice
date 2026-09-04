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
  signup: (email: string, password: string, language?: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

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
    api<{ user: User }>('/api/auth/me', { token: current })
      .then((res) => {
        setUser(res.user)
        setTokenState(current)
      })
      .catch(() => {
        setToken(null)
        setUser(null)
        setTokenState(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      token: null,
    })
    setToken(res.token)
    setTokenState(res.token)
    setUser(res.user)
  }, [])

  const signup = useCallback(async (email: string, password: string, language?: string) => {
    const res = await api<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, language },
      token: null,
    })
    setToken(res.token)
    setTokenState(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const current = getToken()
    if (!current) {
      setUser(null)
      return
    }
    const res = await api<{ user: User }>('/api/auth/me', { token: current })
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
