import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api } from '@/api/apiClient'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'
  status: 'ACTIVE' | 'INACTIVE'
  avatar: string
  bio?: string | null
  photo?: string | null
  /** Full international format without "whatsapp:" prefix
   *  (e.g. "+34612345678"). Used by backend to send WhatsApp
   *  notifications when one of the user's quotes is approved. */
  phone?: string | null
}

interface LoginResponse {
  token: string
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'
  status: 'ACTIVE' | 'INACTIVE'
  avatar: string
  bio?: string | null
  photo?: string | null
  phone?: string | null
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  /** Refresh from /api/users/me — call after self-editing the profile. */
  refreshUser: () => Promise<void>
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'auth-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (!stored) {
      setIsLoading(false)
      return
    }

    let cancelled = false

    // The backend (Render free tier) can be cold-starting on first load, so a
    // single /auth/me call may time out even with a perfectly valid token.
    // Retry a few times before giving up so we don't leave the user stuck on
    // the loading screen or needlessly kick them to /login.
    async function loadSession() {
      const MAX_ATTEMPTS = 3
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const u = await api.get<AuthUser>('/api/auth/me')
          if (!cancelled) setUser(u)
          break
        } catch (err) {
          // A real 401 means the token is invalid — apiClient already cleared
          // it and redirected to /login, so stop retrying.
          if (err instanceof Error && err.message === 'Session expired') break
          // Otherwise it's a network/timeout error (likely cold start): wait a
          // moment and retry. We keep the token so a later load can recover the
          // session once the backend is awake.
          if (attempt < MAX_ATTEMPTS && !cancelled) {
            await new Promise((r) => setTimeout(r, 2000))
          }
        }
      }
      if (!cancelled) setIsLoading(false)
    }

    loadSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email: string, password: string) {
    const data = await api.post<LoginResponse>('/api/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser({
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      status: data.status,
      avatar: data.avatar,
      bio: data.bio ?? null,
      photo: data.photo ?? null,
      phone: data.phone ?? null,
    })
  }

  async function refreshUser() {
    try {
      const u = await api.get<AuthUser>('/api/users/me')
      setUser(u)
    } catch {
      // Silent — caller can decide what to do (typically just retry next login).
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
