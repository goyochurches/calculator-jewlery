import { api } from '@/api/apiClient'
import type { InboxCapabilities, InboxEvent, InboxMessage, InboxThread } from '@/types'

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

  /** Contact-level events (calls, payments) for the thread's peer. */
  listEvents(threadId: number): Promise<InboxEvent[]> {
    return api.get<InboxEvent[]>(`/api/inbox/threads/${threadId}/events`)
  },

  reply(threadId: number, body: string): Promise<InboxMessage> {
    return api.post<InboxMessage>(`/api/inbox/threads/${threadId}/reply`, { body })
  },

  markRead(threadId: number): Promise<void> {
    return api.post<void>(`/api/inbox/threads/${threadId}/mark-read`, {})
  },

  /** Find or create a thread for (channel, peerPhone). Idempotent. */
  openOrCreate(args: { channel: 'WHATSAPP' | 'SMS'; peerPhone: string; clientId?: number | null }): Promise<InboxThread> {
    return api.post<InboxThread>('/api/inbox/threads', {
      channel: args.channel,
      peerPhone: args.peerPhone,
      clientId: args.clientId ?? null,
    })
  },
}
