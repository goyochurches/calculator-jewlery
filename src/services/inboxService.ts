import { api } from '@/api/apiClient'
import type { InboxCapabilities, InboxMessage, InboxThread } from '@/types'

export const inboxService = {
  listThreads(): Promise<InboxThread[]> {
    return api.get<InboxThread[]>('/api/inbox/threads')
  },

  unreadCount(): Promise<{ count: number }> {
    return api.get<{ count: number }>('/api/inbox/unread-count')
  },

  capabilities(): Promise<InboxCapabilities> {
    return api.get<InboxCapabilities>('/api/inbox/capabilities')
  },

  listMessages(threadId: number): Promise<InboxMessage[]> {
    return api.get<InboxMessage[]>(`/api/inbox/threads/${threadId}/messages`)
  },

  reply(threadId: number, body: string): Promise<InboxMessage> {
    return api.post<InboxMessage>(`/api/inbox/threads/${threadId}/reply`, { body })
  },

  markRead(threadId: number): Promise<void> {
    return api.post<void>(`/api/inbox/threads/${threadId}/mark-read`, {})
  },
}
