import { ClientPicker } from '@/components/ClientPicker'
import { useAuth } from '@/context/AuthContext'
import { getBrokerUrl, useWebSocket } from '@/hooks/useWebSocket'
import { inboxService } from '@/services/inboxService'
import type { Client, InboxCapabilities, InboxMessage, InboxThread } from '@/types'
import { Check, CheckCheck, MessageCircle, MessageSquare, Plus, Send, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface InboxPushEvent {
  kind: 'inbound' | 'outbound' | 'read' | 'status' | 'thread'
  threadId: number
}

export function InboxPage() {
  const { isAuthenticated } = useAuth()
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null

  const [threads, setThreads] = useState<InboxThread[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [capabilities, setCapabilities] = useState<InboxCapabilities | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const refreshThreads = useCallback(async () => {
    try {
      const list = await inboxService.listThreads()
      setThreads(list)
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  const refreshMessages = useCallback(async (threadId: number) => {
    setLoadingMessages(true)
    try {
      const list = await inboxService.listMessages(threadId)
      setMessages(list)
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => { void refreshThreads() }, [refreshThreads])
  useEffect(() => {
    inboxService.capabilities().then(setCapabilities).catch(() => setCapabilities(null))
  }, [])

  // When the user opens a thread: load its messages and clear its unread count.
  useEffect(() => {
    if (activeId == null) { setMessages([]); return }
    void refreshMessages(activeId)
    inboxService.markRead(activeId).catch(() => { /* non-fatal */ })
    // Optimistic local update so the badge clears immediately.
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, unreadCount: 0 } : t))
  }, [activeId, refreshMessages])

  // Auto-scroll to bottom whenever the message list grows.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Live updates. We re-fetch the affected slice rather than try to patch
  // state — the payloads are small and this keeps the FE in sync with the
  // backend's view (last-message preview, ordering, etc.).
  useWebSocket<InboxPushEvent>({
    url: getBrokerUrl(),
    topic: '/topic/inbox',
    token,
    enabled: isAuthenticated,
    onMessage: (evt) => {
      void refreshThreads()
      if (activeId != null && evt.threadId === activeId) {
        void refreshMessages(activeId)
      }
    },
  })

  const activeThread = useMemo(
    () => threads.find(t => t.id === activeId) ?? null,
    [threads, activeId],
  )

  const canReply = useMemo(() => {
    if (!activeThread || !capabilities) return false
    return activeThread.channel === 'WHATSAPP' ? capabilities.canSendWhatsapp : capabilities.canSendSms
  }, [activeThread, capabilities])

  const handleSend = async () => {
    if (!activeThread || !draft.trim()) return
    setSending(true); setSendError(null)
    try {
      await inboxService.reply(activeThread.id, draft.trim())
      setDraft('')
      await refreshMessages(activeThread.id)
      await refreshThreads()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send the message.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      {/* ── Thread list ─────────────────────────────────────────────── */}
      <aside className="flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Conversations</h2>
            <p className="text-xs text-slate-500">WhatsApp + SMS · shared inbox</p>
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : threads.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No conversations yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Incoming WhatsApp / SMS messages will appear here.
              </p>
            </div>
          ) : (
            <ul>
              {threads.map(t => {
                const isActive = t.id === activeId
                const displayName = t.peerClientName ?? t.peerPhone
                const sub = t.peerClientName ? t.peerPhone : null
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setActiveId(t.id)}
                      className={`flex w-full items-start gap-3 border-b border-slate-100 px-5 py-3.5 text-left transition ${
                        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                        t.channel === 'WHATSAPP'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-sky-50 text-sky-700'
                      }`}>
                        <MessageCircle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                          <time className="shrink-0 text-[10px] text-slate-400">
                            {formatRelative(t.lastMessageAt)}
                          </time>
                        </div>
                        {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {t.lastMessageDirection === 'OUTBOUND' && <span className="text-slate-400">You: </span>}
                          {t.lastMessagePreview ?? '(no message)'}
                        </p>
                      </div>
                      {t.unreadCount > 0 && (
                        <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                          {t.unreadCount > 99 ? '99+' : t.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {newOpen && (
        <NewConversationDialog
          capabilities={capabilities}
          onClose={() => setNewOpen(false)}
          onCreated={async (thread) => {
            setNewOpen(false)
            await refreshThreads()
            setActiveId(thread.id)
          }}
        />
      )}

      {/* ── Conversation pane ────────────────────────────────────────── */}
      <section className="flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {!activeThread ? (
          <div className="m-auto px-8 text-center">
            <MessageCircle className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Pick a conversation to read it here.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {activeThread.peerClientName ?? activeThread.peerPhone}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {activeThread.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}
                  {' · '}{activeThread.peerPhone}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {loadingMessages ? (
                <p className="text-center text-sm text-slate-400">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No messages yet in this thread.</p>
              ) : (
                <div className="space-y-3">
                  {messages.map(m => (
                    <MessageBubble key={m.id} m={m} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <footer className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
              {!canReply && capabilities && (
                <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {activeThread.channel === 'WHATSAPP'
                    ? 'WhatsApp sender is not configured — set TWILIO_WHATSAPP_FROM to enable replies.'
                    : 'SMS sender is not configured — set TWILIO_SMS_FROM (and buy a Twilio SMS number) to enable replies.'}
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  rows={2}
                  disabled={!canReply || sending}
                  placeholder={canReply ? 'Type a reply… (⌘/Ctrl + Enter to send)' : 'Replies disabled — sender not configured.'}
                  className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canReply || sending || draft.trim() === ''}
                  className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {sendError && (
                <p className="mt-2 text-xs font-medium text-rose-600">{sendError}</p>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

function NewConversationDialog({
  capabilities,
  onClose,
  onCreated,
}: {
  capabilities: InboxCapabilities | null
  onClose: () => void
  onCreated: (thread: InboxThread) => void
}) {
  const canWa = capabilities?.canSendWhatsapp ?? false
  const canSms = capabilities?.canSendSms ?? false

  const [client, setClient] = useState<Client | null>(null)
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<'WHATSAPP' | 'SMS'>(
    canWa ? 'WHATSAPP' : canSms ? 'SMS' : 'WHATSAPP',
  )
  const [firstMessage, setFirstMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-fill the phone field when the user picks a client that has one.
  useEffect(() => {
    if (client?.phone) setPhone(client.phone)
  }, [client])

  const channelEnabled = channel === 'WHATSAPP' ? canWa : canSms

  const submit = async () => {
    const trimmed = phone.trim()
    if (!trimmed) { setError('Phone number is required.'); return }
    const draft = firstMessage.trim()
    if (draft && !channelEnabled) {
      setError(channel === 'WHATSAPP'
        ? 'WhatsApp sender is not configured — cannot send the first message.'
        : 'SMS sender is not configured — cannot send the first message.')
      return
    }
    setSubmitting(true); setError(null)
    try {
      const thread = await inboxService.openOrCreate({
        channel,
        peerPhone: trimmed,
        clientId: client?.id ?? null,
      })
      // If the user typed an opening message, fire it through the same
      // reply endpoint we use elsewhere — keeps Twilio + persistence +
      // STOMP broadcast on one path. Failures here surface in the dialog
      // so the user can retry without losing the thread.
      if (draft) {
        try {
          await inboxService.reply(thread.id, draft)
        } catch (sendErr) {
          setError(sendErr instanceof Error
            ? `Thread created, but the first message failed: ${sendErr.message}`
            : 'Thread created, but the first message failed.')
          onCreated(thread)
          return
        }
      }
      onCreated(thread)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start the conversation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Start a new conversation</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Channel</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChannel('WHATSAPP')}
                disabled={!canWa}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                  channel === 'WHATSAPP'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${!canWa ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setChannel('SMS')}
                disabled={!canSms}
                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
                  channel === 'SMS'
                    ? 'border-sky-500 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${!canSms ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <MessageCircle className="h-4 w-4" />
                SMS
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Client (optional)</p>
            <ClientPicker value={client} onChange={setClient} />
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Phone number *</p>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Use E.164 format with country code (e.g. +34…).
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              First message (optional)
            </p>
            <textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              rows={3}
              disabled={!channelEnabled}
              placeholder={channelEnabled
                ? 'Type the opening message…'
                : 'Sender not configured — you can still create the thread.'}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Leave blank to just open the thread without sending anything.
            </p>
          </div>

          {!channelEnabled && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {channel === 'WHATSAPP'
                ? 'WhatsApp sender is not configured — set TWILIO_WHATSAPP_FROM to send the first message.'
                : 'SMS sender is not configured — set TWILIO_SMS_FROM (and buy a Twilio SMS number) to send the first message.'}
            </p>
          )}

          {error && (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !phone.trim()}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {firstMessage.trim() && <Send className="h-3.5 w-3.5" />}
            {submitting
              ? (firstMessage.trim() ? 'Sending…' : 'Starting…')
              : (firstMessage.trim() ? 'Send & open' : 'Start conversation')}
          </button>
        </footer>
      </div>
    </div>
  )
}

function MessageBubble({ m }: { m: InboxMessage }) {
  const isOut = m.direction === 'OUTBOUND'
  const failed = isOut && (m.status === 'FAILED' || m.status === 'failed' || (m.error != null && m.error !== ''))
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
        isOut
          ? (failed ? 'bg-rose-100 text-rose-900' : 'bg-slate-900 text-white')
          : 'bg-slate-100 text-slate-900'
      }`}>
        <p className="whitespace-pre-wrap break-words">{m.body ?? ''}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isOut ? (failed ? 'text-rose-800' : 'text-slate-300') : 'text-slate-400'}`}>
          {isOut && m.sentByUserName ? <span>{m.sentByUserName} ·</span> : null}
          <span>{formatTime(m.createdAt)}</span>
          {failed && m.error ? <span>· {m.error}</span> : null}
          {isOut && !failed && <DeliveryTick status={m.status} />}
        </p>
      </div>
    </div>
  )
}

/**
 * WhatsApp-style delivery indicator for OUTBOUND messages. Maps the
 * provider status to a glyph:
 *   queued / sending  → single hollow tick
 *   sent              → single tick
 *   delivered         → double tick
 *   read              → double tick, blue
 *   undelivered       → single tick, amber
 *   anything else     → nothing (e.g. SMS providers that don't report)
 */
function DeliveryTick({ status }: { status: string | null }) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="read" />
  }
  if (s === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5" aria-label="delivered" />
  }
  if (s === 'sent') {
    return <Check className="h-3.5 w-3.5" aria-label="sent" />
  }
  if (s === 'undelivered') {
    return <Check className="h-3.5 w-3.5 text-amber-400" aria-label="undelivered" />
  }
  if (s === 'queued' || s === 'sending' || s === 'accepted' || s === 'scheduled') {
    return <Check className="h-3.5 w-3.5 opacity-50" aria-label="queued" />
  }
  return null
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d`
  return date.toLocaleDateString()
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}
