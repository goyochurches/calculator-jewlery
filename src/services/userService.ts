import { api } from '@/api/apiClient'
import type { Usuario } from '../types'

interface ApiUser {
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

function mapUser(u: ApiUser): Usuario {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    role: u.role.toLowerCase() as Usuario['role'],
    status: u.status.toLowerCase() as Usuario['status'],
    avatar: u.avatar,
    bio: u.bio ?? null,
    photo: u.photo ?? null,
    phone: u.phone ?? null,
  }
}

export const userService = {
  async getAll(): Promise<Usuario[]> {
    const data = await api.get<ApiUser[]>('/api/users')
    return data.map(mapUser)
  },

  async create(payload: {
    name: string; email: string
    role: 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'; avatar: string
  }): Promise<Usuario> {
    const data = await api.post<ApiUser>('/api/users', {
      ...payload,
      status: 'ACTIVE',
    })
    return mapUser(data)
  },

  async updateStatus(id: string, _status: 'active' | 'inactive'): Promise<void> {
    await api.patch(`/api/users/${id}/toggle-status`)
  },

  async delete(id: string): Promise<void> {
    await api.delete<void>(`/api/users/${id}`)
  },

  /** Self or admin profile edit. Updates name, avatar, bio, photo and phone —
   *  role/status/email remain untouched. */
  async updateProfile(id: string, payload: { name?: string; avatar?: string | null; bio?: string | null; photo?: string | null; phone?: string | null }): Promise<Usuario> {
    const data = await api.patch<ApiUser>(`/api/users/${id}/profile`, payload)
    return mapUser(data)
  },

  async getById(id: string): Promise<Usuario> {
    const data = await api.get<ApiUser>(`/api/users/${id}`)
    return mapUser(data)
  },
}
