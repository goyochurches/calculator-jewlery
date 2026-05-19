import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getBrokerUrl, useWebSocket } from '@/hooks/useWebSocket'
import { notificationService, type AppNotification } from '@/services/notificationService'

// Keep the polling cadence — the WS push handles the real-time path, but
// polling also reconciles state if a message was missed during reconnect.
const POLL_INTERVAL = 30_000

export function useNotifications() {
  const { user, token } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  /** Most recent notification pushed via WebSocket. Consumers use this to
   *  trigger a transient Toast; null = nothing to show. */
  const [lastPush, setLastPush] = useState<AppNotification | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await notificationService.getAll()
      setNotifications(data)
    } catch {
      // silent — user might not be logged in yet
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  // Real-time push: subscribe to the user's notification topic on the STOMP
  // broker and prepend each arrival to the in-memory list.
  useWebSocket<AppNotification>({
    url: getBrokerUrl(),
    topic: user ? `/topic/notifications/${user.id}` : '',
    token,
    enabled: !!user && !!token,
    onMessage: n => {
      setNotifications(prev => {
        // De-dupe in case the polling cycle already pulled the same row.
        if (prev.some(existing => existing.id === n.id)) return prev
        return [n, ...prev]
      })
      setLastPush(n)
    },
  })

  const markRead = async (notif: AppNotification) => {
    if (notif.read) return
    await notificationService.markRead(notif.id)
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
  }

  const markAllRead = async () => {
    await notificationService.markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const dismissLastPush = () => setLastPush(null)

  const unreadCount = notifications.filter(n => !n.read).length

  return { notifications, unreadCount, markRead, markAllRead, refresh, lastPush, dismissLastPush }
}
