const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

/** Abort a request if it hangs (e.g. backend cold-start on Render) so callers
 *  fail fast instead of leaving the UI stuck — see AuthContext loading state. */
const DEFAULT_TIMEOUT_MS = 15000

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

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

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
