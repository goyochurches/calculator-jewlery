const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function getToken(): string | null {
  return localStorage.getItem('auth-token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // No request timeout on purpose: the backend (Render free tier) spins down
  // after inactivity, so a cold-start request can legitimately take 30–60s to
  // wake up. We let the request wait as long as it needs rather than aborting
  // and surfacing a misleading "invalid credentials" error on the login screen.
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('auth-token')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try { message = await res.text() } catch { /* ignore */ }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get:    <T>(path: string)                   => request<T>(path),
  post:   <T>(path: string, body: unknown)    => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)    => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown)   => request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string)                   => request<T>(path, { method: 'DELETE' }),
}
