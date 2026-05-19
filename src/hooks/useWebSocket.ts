import { Client, type StompSubscription } from '@stomp/stompjs'
import { useEffect, useRef } from 'react'

interface UseWebSocketOptions<T> {
  /** Full ws(s):// URL of the STOMP endpoint, e.g. ws://localhost:8080/ws. */
  url: string
  /** Topic to subscribe to once connected, e.g. /topic/notifications/42. */
  topic: string
  /** JWT, used in the STOMP CONNECT frame's Authorization header. */
  token: string | null
  /** Skip everything when false — useful while the user isn't logged in. */
  enabled: boolean
  /** Called for each incoming message after JSON-parsing the body. */
  onMessage: (data: T) => void
}

/**
 * Thin wrapper around @stomp/stompjs that:
 *   - opens a single STOMP-over-WebSocket connection,
 *   - subscribes to one topic,
 *   - auto-reconnects every 5 s if the connection drops,
 *   - cleans up on unmount or when auth changes.
 *
 * `onMessage` is captured in a ref so consumers can safely pass an inline
 * closure without triggering reconnects.
 */
export function useWebSocket<T>({ url, topic, token, enabled, onMessage }: UseWebSocketOptions<T>) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!enabled || !token || !topic) return

    let subscription: StompSubscription | null = null
    const client = new Client({
      brokerURL: url,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      // Silence the noisy default debug logger — flip to console.log when
      // diagnosing handshake issues.
      debug: () => {},
    })

    client.onConnect = () => {
      subscription = client.subscribe(topic, msg => {
        try {
          const data = JSON.parse(msg.body) as T
          onMessageRef.current(data)
        } catch (e) {
          console.error('Failed to parse WS message', e)
        }
      })
    }

    client.onStompError = frame => {
      console.error('STOMP error', frame.headers['message'], frame.body)
    }

    client.activate()

    return () => {
      try { subscription?.unsubscribe() } catch { /* ignore */ }
      client.deactivate().catch(() => { /* ignore */ })
    }
  }, [url, topic, token, enabled])
}

/** Derive the STOMP broker URL from the REST API URL configured for this app. */
export function getBrokerUrl(): string {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  return base.replace(/^http/, 'ws') + '/ws'
}
