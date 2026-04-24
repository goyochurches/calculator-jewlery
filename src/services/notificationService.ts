import { api } from '@/api/apiClient'

export interface AppNotification {
  id: number
  message: string
  type: 'SUCCESS' | 'INFO' | 'WARNING' | 'DANGER'
  link: string | null
  read: boolean
  createdAt: string
}

export const notificationService = {
  getAll:      ()         => api.get<AppNotification[]>('/api/notifications'),
  countUnread: ()         => api.get<{ count: number }>('/api/notifications/count'),
  markRead:    (id: number) => api.patch<void>(`/api/notifications/${id}/read`),
  markAllRead: ()         => api.patch<void>('/api/notifications/mark-all-read'),
}
