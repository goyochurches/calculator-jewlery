import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { api } from '@/api/apiClient'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'
  status: 'ACTIVE' | 'INACTIVE'
  avatar: string
}

interface LoginResponse {
  token: string
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'
  status: 'ACTIVE' | 'INACTIVE'
  avatar: string
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
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
    api.get<AuthUser>('/api/auth/me')
      .then((u) => setUser(u))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      })
      .finally(() => setIsLoading(false))
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
    })
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
