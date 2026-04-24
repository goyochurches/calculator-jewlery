import { useCallback, useEffect, useState } from 'react'
import { notificationService, type AppNotification } from '@/services/notificationService'

const POLL_INTERVAL = 30_000

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])

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

  const markRead = async (notif: AppNotification) => {
    if (notif.read) return
    await notificationService.markRead(notif.id)
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n))
  }

  const markAllRead = async () => {
    await notificationService.markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return { notifications, unreadCount, markRead, markAllRead, refresh }
}
