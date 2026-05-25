import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getBrokerUrl, useWebSocket } from '@/hooks/useWebSocket'
import { inboxService } from '@/services/inboxService'

interface InboxPushEvent {
  kind: 'inbound' | 'outbound' | 'read'
  threadId: number
}

/**
 * Global inbox unread counter. Fetches once on mount and re-fetches on every
 * push event from /topic/inbox so the nav badge stays accurate without each
 * tab maintaining its own thread cache.
 */
export function useInboxUnread() {
  const { isAuthenticated } = useAuth()
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setCount(0); return }
    try {
      const { count } = await inboxService.unreadCount()
      setCount(count)
    } catch {
      // Keep the previous count — a transient network blip shouldn't zero the badge.
    }
  }, [isAuthenticated])

  useEffect(() => { void refresh() }, [refresh])

  useWebSocket<InboxPushEvent>({
    url: getBrokerUrl(),
    topic: '/topic/inbox',
    token,
    enabled: isAuthenticated,
    onMessage: () => { void refresh() },
  })

  return { unread: count, refresh }
}
