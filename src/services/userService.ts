import { api } from '@/api/apiClient'
import type { Usuario } from '../types'

interface ApiUser {
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'ANALYST' | 'READONLY'
  status: 'ACTIVE' | 'INACTIVE'
  avatar: string
}

function mapUser(u: ApiUser): Usuario {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    role: u.role.toLowerCase() as Usuario['role'],
    status: u.status.toLowerCase() as Usuario['status'],
    avatar: u.avatar,
  }
}

export const userService = {
  async getAll(): Promise<Usuario[]> {
    const data = await api.get<ApiUser[]>('/api/users')
    return data.map(mapUser)
  },

  async create(payload: {
    name: string; email: string
    role: 'ADMIN' | 'ANALYST' | 'READONLY'; avatar: string
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
}
