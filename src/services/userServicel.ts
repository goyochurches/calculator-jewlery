import { mockUsers } from '../data/mockData'
import type { Usuario } from '../types'

export const userService = {
  async getAll(): Promise<Usuario[]> {
    // TODO: replace with a real API call
    return Promise.resolve(mockUsers)
  },

  async updateStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
    // TODO: replace with a real API call
    console.log(`Update user ${id} to ${status}`)
    return Promise.resolve()
  },
}
