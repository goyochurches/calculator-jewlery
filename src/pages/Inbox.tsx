import { ClientPicker } from '@/components/ClientPicker'
import { MessageText } from '@/components/MessageText'
import { useAuth } from '@/context/AuthContext'
import { getBrokerUrl, useWebSocket } from '@/hooks/useWebSocket'
import { inboxService } from '@/services/inboxService'
import type { Client, InboxCapabilities, InboxEvent, InboxMessage, InboxThread } from '@/types'
import {
  Check, CheckCheck, Loader2, MessageCircle, MessageSquare, Phone, PhoneIncoming,
  PhoneMissed, PhoneOutgoing, Plus, RotateCcw, Search, Send, Smartphone, X,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Channel = 'WHATSAPP' | 'SMS'

interface InboxPushEvent {
  kind: 'inbound' | 'outbound' | 'read' | 'status' | 'thread' | 'event'
  threadId?: number
  /** Set on 'event' (call / payment) broadcasts — events are contact-level. */
  peerPhone?: string
}

/** All threads for the same person (linked Client OR same phone if no client). */
interface ThreadGroup {
  key: string
  clientId: number | null
  clientName: string | null
  /** WhatsApp profile name when there's no linked client. */
  peerName: string | null
  phone: string
  channels: { channel: Channel; thread: InboxThread }[]
  latestAt: string
  latestPreview: string | null
  latestDirection: 'INBOUND' | 'OUTBOUND' | null
  latestSenderName: string | null
  totalUnread: number
}

export function InboxPage() {
  const { isAuthenticated } = useAuth()
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null

  const [threads, setThreads] = useState<InboxThread[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [events, setEvents] = useState<InboxEvent[]>([])
  const [capabilities, setCapabilities] = useState<InboxCapabilities | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [search, setSearch] = useState('')
  /** Unix-ms timestamp until which sending is blocked because the user
   *  tripped the anti-spam guard (repeated identical messages). */
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  /** Force a re-render once per second while a cooldown is active, so the
   *  countdown in the banner ticks down live. */
  const [, setTick] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  /**
   * Per-thread recent send log used by the anti-spam guard. We keep
   * { body, at } entries for ~60s and count consecutive duplicates.
   * Ref instead of state because it doesn't drive any rendering.
   */
  const sendHistoryRef = useRef<Map<number, { body: string; at: number }[]>>(new Map())

  const refreshThreads = useCallback(async () => {
    try {
      const list = await inboxService.listThreads()
      setThreads(list)
    } finally {
      setLoadingThreads(false)
    }
  }, [])

  /**
   * Silent refresh: swap the messages array without flipping the loading
   * spinner. Used by websocket-driven updates and post-send so the chat
   * pane doesn't flash "Loading…" every time a status callback arrives.
   */
  const refreshMessagesSilent = useCallback(async (threadId: number) => {
    try {
      const list = await inboxService.listMessages(threadId)
      setMessages(prev => {
        // Reconciliation: keep prev refs for unchanged rows so React's
        // diff stays cheap and existing bubbles don't repaint.
        const byId = new Map(prev.map(m => [m.id, m]))
        return list.map(m => {
          const existing = byId.get(m.id)
          if (!existing) return m
          // Same row, same payload → keep the existing object reference.
          if (
            existing.status === m.status
            && existing.error === m.error
            && existing.body === m.body
          ) return existing
          return m
        })
      })
    } catch { /* non-fatal */ }
  }, [])

  /** Loud refresh: shows the loading state. Use only on explicit thread switches. */
  const refreshMessages = useCallback(async (threadId: number) => {
    setLoadingMessages(true)
    try {
      const list = await inboxService.listMessages(threadId)
      setMessages(list)
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  /** Contact-level events (calls, payments) for the active thread's peer. */
  const refreshEvents = useCallback(async (threadId: number) => {
    try {
      const list = await inboxService.listEvents(threadId)
      setEvents(list)
    } catch { /* non-fatal — the chat still renders without events */ }
  }, [])

  /** Re-send a failed message; refresh so the bubble flips red → normal on success. */
  const handleRetry = useCallback(async (messageId: number) => {
    try {
      await inboxService.retryMessage(messageId)
    } catch { /* the refresh below still reflects the latest status */ }
    if (activeId != null) await refreshMessagesSilent(activeId)
  }, [activeId, refreshMessagesSilent])

  useEffect(() => { void refreshThreads() }, [refreshThreads])
  useEffect(() => {
    inboxService.capabilities().then(setCapabilities).catch(() => setCapabilities(null))
  }, [])

  useEffect(() => {
    if (activeId == null) { setMessages([]); setEvents([]); return }
    void refreshMessages(activeId)
    void refreshEvents(activeId)
    inboxService.markRead(activeId).catch(() => { /* non-fatal */ })
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, unreadCount: 0 } : t))
  }, [activeId, refreshMessages, refreshEvents])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  // Tick the cooldown countdown every second while it's active.
  useEffect(() => {
    if (cooldownUntil == null) return
    const ms = cooldownUntil - Date.now()
    if (ms <= 0) { setCooldownUntil(null); return }
    const interval = setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setCooldownUntil(null)
        clearInterval(interval)
      } else {
        setTick(t => t + 1)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldownUntil])

  useWebSocket<InboxPushEvent>({
    url: getBrokerUrl(),
    topic: '/topic/inbox',
    token,
    enabled: isAuthenticated,
    onMessage: (evt) => {
      // Silent refresh — these events fire on every status callback
      // (sent → delivered → read), so flashing a loading spinner each
      // time would make the chat pane jitter constantly.
      void refreshThreads()
      if (activeId != null && evt.threadId === activeId) {
        void refreshMessagesSilent(activeId)
      }
      // Call / payment events are contact-level (no threadId); refresh the
      // open conversation's events so the new row appears live.
      if (evt.kind === 'event' && activeId != null) {
        void refreshEvents(activeId)
      }
    },
  })

  const groups = useMemo(() => groupThreads(threads), [threads])

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups.filter(g =>
      (g.clientName ?? '').toLowerCase().includes(q) ||
      g.phone.toLowerCase().includes(q) ||
      (g.latestPreview ?? '').toLowerCase().includes(q),
    )
  }, [groups, search])

  const activeGroup = useMemo<ThreadGroup | null>(() => {
    if (activeId == null) return null
    return groups.find(g => g.channels.some(c => c.thread.id === activeId)) ?? null
  }, [groups, activeId])

  const activeThread = useMemo(
    () => activeGroup?.channels.find(c => c.thread.id === activeId)?.thread ?? null,
    [activeGroup, activeId],
  )

  const canReply = useMemo(() => {
    if (!activeThread || !capabilities) return false
    return activeThread.channel === 'WHATSAPP' ? capabilities.canSendWhatsapp : capabilities.canSendSms
  }, [activeThread, capabilities])

  const handleSend = async () => {
    if (!activeThread || !draft.trim()) return
    const body = draft.trim()
    const threadId = activeThread.id
    const channel = activeThread.channel

    // ── Anti-spam guard ────────────────────────────────────────────
    // Twilio charges per send and repeated identical messages are
    // almost always a misclick (double-tap, frustrated retry). Block
    // when the user has sent THIS exact body 3+ times in the last
    // minute and lock the button for SPAM_COOLDOWN_MS so they have a
    // chance to course-correct.
    const SPAM_WINDOW_MS = 60_000
    const SPAM_THRESHOLD = 3
    const SPAM_COOLDOWN_MS = 15_000
    const now = Date.now()
    if (cooldownUntil != null && now < cooldownUntil) {
      const left = Math.ceil((cooldownUntil - now) / 1000)
      setSendError(`Wait ${left}s before sending again — too many repeats.`)
      return
    }
    const recent = (sendHistoryRef.current.get(threadId) ?? [])
      .filter(s => now - s.at < SPAM_WINDOW_MS)
    const sameCount = recent.filter(s => s.body === body).length
    if (sameCount >= SPAM_THRESHOLD) {
      setCooldownUntil(now + SPAM_COOLDOWN_MS)
      setSendError(
        `You've sent this same message ${sameCount} times in the last minute. ` +
        `Pause for ${SPAM_COOLDOWN_MS / 1000}s to avoid duplicates.`,
      )
      return
    }
    recent.push({ body, at: now })
    sendHistoryRef.current.set(threadId, recent)

    setSending(true); setSendError(null)
    // Optimistically clear the input and append a placeholder bubble so
    // the message appears instantly. The real row replaces it once the
    // server responds (matched by twilio_sid / id when the silent refresh
    // arrives — until then we use a negative id sentinel).
    const optimisticId = -Date.now()
    setDraft('')
    setMessages(prev => [
      ...prev,
      {
        id: optimisticId,
        threadId,
        direction: 'OUTBOUND',
        channel,
        fromNumber: '',
        toNumber: '',
        body,
        status: 'sending',
        error: null,
        sentByUserName: null,
        createdAt: new Date().toISOString(),
      },
    ])
    try {
      await inboxService.reply(threadId, body)
      // Silent refresh — avoids the loading flash. The optimistic row
      // disappears when this replaces the array with the server's view.
      await refreshMessagesSilent(threadId)
      void refreshThreads()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Failed to send the message.')
      // Drop the optimistic row on failure.
      setMessages(prev => prev.filter(m => m.id !== optimisticId))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      {/* ─── Thread list ───────────────────────────────────────────── */}
      <aside className="flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Conversations</h2>
              <p className="text-xs text-slate-500">WhatsApp + SMS · shared inbox</p>
            </div>
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, message…"
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-slate-300 focus:bg-white"
            />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loadingThreads ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Loading…</p>
          ) : filteredGroups.length === 0 ? (
            <EmptyState filtered={search.trim().length > 0} />
          ) : (
            <ul className="py-1">
              {filteredGroups.map(g => (
                <ThreadRow
                  key={g.key}
                  group={g}
                  activeThreadId={activeId}
                  onSelect={(threadId) => setActiveId(threadId)}
                />
              ))}
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

      {/* ─── Conversation pane ─────────────────────────────────────── */}
      <section className="flex h-[calc(100vh-180px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-sm">
        {!activeThread || !activeGroup ? (
          <EmptyConversation />
        ) : (
          <>
            <ConversationHeader
              group={activeGroup}
              activeThreadId={activeThread.id}
              onSwitchChannel={(threadId) => setActiveId(threadId)}
            />

            <div className="flex-1 overflow-y-auto px-5 py-6">
              {loadingMessages ? (
                <p className="text-center text-sm text-slate-400">Loading messages…</p>
              ) : messages.length === 0 && events.length === 0 ? (
                <p className="mt-12 text-center text-sm text-slate-400">
                  No messages yet in this thread.
                </p>
              ) : (
                <Timeline
                  messages={messages}
                  events={events}
                  channel={activeThread.channel as Channel}
                  peerLabel={activeGroup.clientName ?? activeGroup.peerName ?? activeGroup.phone}
                  onRetry={handleRetry}
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            <Composer
              canReply={canReply}
              capabilities={capabilities}
              channel={activeThread.channel as Channel}
              sending={sending}
              draft={draft}
              error={sendError}
              cooldownSecondsLeft={cooldownUntil != null
                ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
                : 0}
              onChange={setDraft}
              onSend={() => void handleSend()}
            />
          </>
        )}
      </section>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Thread list
// ───────────────────────────────────────────────────────────────────

function ThreadRow({
  group, activeThreadId, onSelect,
}: {
  group: ThreadGroup
  activeThreadId: number | null
  onSelect: (threadId: number) => void
}) {
  const isActive = group.channels.some(c => c.thread.id === activeThreadId)
  const knownName = group.clientName ?? group.peerName
  const displayName = knownName ?? group.phone
  const subline = knownName ? group.phone : null
  const palette = avatarColor(group.key)
  // 2 initials when we know who it is; "A" (anonymous) for a bare number.
  const initials = knownName ? getInitials(knownName) : 'A'

  const handleClick = () => {
    // Open the most recently active channel for this person.
    const sorted = [...group.channels].sort((a, b) =>
      new Date(b.thread.lastMessageAt).getTime() - new Date(a.thread.lastMessageAt).getTime())
    onSelect(sorted[0].thread.id)
  }

  return (
    <li>
      <button
        onClick={handleClick}
        className={`flex w-full items-start gap-3 border-b border-slate-100 px-5 py-3.5 text-left transition ${
          isActive ? 'bg-slate-100/80' : 'hover:bg-slate-50'
        }`}
      >
        <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <time className="shrink-0 text-[10px] text-slate-400">
              {formatRelative(group.latestAt)}
            </time>
          </div>
          {subline && <p className="truncate text-[11px] text-slate-400">{subline}</p>}
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-slate-500">
              {group.latestSenderName ? (
                <span className="mr-1 inline-flex items-center rounded bg-slate-100 px-1 py-0.5 align-middle text-[9px] font-semibold text-slate-500">
                  {group.latestSenderName}
                </span>
              ) : group.latestDirection === 'OUTBOUND' ? (
                <span className="text-slate-400">You: </span>
              ) : null}
              {group.latestPreview ?? <span className="italic text-slate-300">(no message)</span>}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {group.channels.map(c => (
                <ChannelDot key={c.thread.id} channel={c.channel} />
              ))}
              {group.totalUnread > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                  {group.totalUnread > 99 ? '99+' : group.totalUnread}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </li>
  )
}

function ChannelDot({ channel }: { channel: Channel }) {
  if (channel === 'WHATSAPP') {
    return (
      <span title="WhatsApp" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <MessageCircle className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    )
  }
  return (
    <span title="SMS" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-50 text-sky-600">
      <Smartphone className="h-2.5 w-2.5" strokeWidth={2.5} />
    </span>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-5 py-12 text-center">
      <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-3 text-sm text-slate-500">
        {filtered ? 'No matches.' : 'No conversations yet.'}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {filtered
          ? 'Try a different name or phone.'
          : 'Incoming WhatsApp / SMS messages will appear here.'}
      </p>
    </div>
  )
}

function EmptyConversation() {
  return (
    <div className="m-auto px-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <MessageCircle className="h-7 w-7" />
      </div>
      <p className="text-sm font-medium text-slate-700">No conversation selected</p>
      <p className="mt-1 text-xs text-slate-500">Pick someone from the list, or start a new one.</p>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Conversation header (with channel switcher)
// ───────────────────────────────────────────────────────────────────

function ConversationHeader({
  group, activeThreadId, onSwitchChannel,
}: {
  group: ThreadGroup
  activeThreadId: number
  onSwitchChannel: (threadId: number) => void
}) {
  const displayName = group.clientName ?? group.peerName ?? group.phone
  const palette = avatarColor(group.key)
  const hasMultipleChannels = group.channels.length > 1

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white/80 px-5 py-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${palette.bg} ${palette.text}`}>
          {getInitials(displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="flex items-center gap-1 truncate text-xs text-slate-500">
            <Phone className="h-3 w-3" />
            {group.phone}
          </p>
        </div>
      </div>
      {hasMultipleChannels && (
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {group.channels.map(({ channel, thread }) => {
            const active = thread.id === activeThreadId
            const tone = channel === 'WHATSAPP'
              ? (active ? 'bg-emerald-500 text-white shadow' : 'text-emerald-700 hover:bg-emerald-50')
              : (active ? 'bg-sky-500 text-white shadow' : 'text-sky-700 hover:bg-sky-50')
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSwitchChannel(thread.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${tone}`}
              >
                {channel === 'WHATSAPP'
                  ? <MessageCircle className="h-3.5 w-3.5" />
                  : <Smartphone className="h-3.5 w-3.5" />}
                {channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}
                {thread.unreadCount > 0 && !active && (
                  <span className="ml-0.5 rounded-full bg-rose-500 px-1.5 text-[9px] font-bold text-white">
                    {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {!hasMultipleChannels && (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
          group.channels[0].channel === 'WHATSAPP'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-sky-50 text-sky-700'
        }`}>
          {group.channels[0].channel === 'WHATSAPP'
            ? <MessageCircle className="h-3.5 w-3.5" />
            : <Smartphone className="h-3.5 w-3.5" />}
          {group.channels[0].channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}
        </span>
      )}
    </header>
  )
}

// ───────────────────────────────────────────────────────────────────
// Message list + bubbles
// ───────────────────────────────────────────────────────────────────

/** A message or a contact-level event, tagged for the merged timeline. */
type TimelineItem =
  | { kind: 'message'; at: string; key: string; message: InboxMessage }
  | { kind: 'event'; at: string; key: string; event: InboxEvent }

/** Merge messages + events into one chronological list (oldest first). */
function buildTimeline(messages: InboxMessage[], events: InboxEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...messages.map((m): TimelineItem => ({ kind: 'message', at: m.createdAt, key: `m${m.id}`, message: m })),
    ...events.map((e): TimelineItem => ({ kind: 'event', at: e.createdAt, key: `e${e.id}`, event: e })),
  ]
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function Timeline({
  messages, events, channel, peerLabel, onRetry,
}: {
  messages: InboxMessage[]
  events: InboxEvent[]
  channel: Channel
  peerLabel: string
  onRetry: (messageId: number) => void
}) {
  const items = buildTimeline(messages, events)
  let lastDay = ''
  return (
    <div className="space-y-2.5">
      {items.map(item => {
        const day = formatDay(item.at)
        const sep = day !== lastDay
        lastDay = day
        return (
          <Fragment key={item.key}>
            {sep && <DateSeparator day={day} />}
            {item.kind === 'message'
              ? <MessageBubble m={item.message} channel={channel} onRetry={onRetry} />
              : <EventRow event={item.event} peerLabel={peerLabel} />}
          </Fragment>
        )
      })}
    </div>
  )
}

/** Centered, system-style row for a call or payment inside the timeline. */
function EventRow({ event, peerLabel }: { event: InboxEvent; peerLabel: string }) {
  if (event.type === 'CALL') return <CallEventRow event={event} peerLabel={peerLabel} />
  if (event.type === 'PAYMENT') return <PaymentEventRow event={event} />
  if (event.type === 'REFUND') return <RefundEventRow event={event} />
  return null
}

function RefundEventRow({ event }: { event: InboxEvent }) {
  const amount = event.amountCents != null
    ? formatMoney(event.amountCents, event.currency ?? 'EUR')
    : null
  return (
    <div className="my-1 flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
        <span>↩️ Refund issued</span>
        {amount && <span className="font-semibold">· {amount}</span>}
        <span className="opacity-60">· {formatTime(event.createdAt)}</span>
      </span>
    </div>
  )
}

function CallEventRow({ event, peerLabel }: { event: InboxEvent; peerLabel: string }) {
  const out = event.direction === 'OUTBOUND'
  const status = (event.status ?? '').toLowerCase()
  const answered = status === 'completed'
  const missed = !out && !answered

  const { Icon, tone } = missed
    ? { Icon: PhoneMissed, tone: 'text-rose-600 bg-rose-50 border-rose-200' }
    : out
      ? { Icon: PhoneOutgoing, tone: 'text-sky-600 bg-sky-50 border-sky-200' }
      : { Icon: PhoneIncoming, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' }

  // Direction phrased with the contact: "Call to María" / "Call from María".
  const label = missed
    ? `Missed call from ${peerLabel}`
    : out
      ? (answered ? `Call to ${peerLabel}` : `${callOutcome(status, 'No answer')} · ${peerLabel}`)
      : `Call from ${peerLabel}`

  const detail = answered && event.durationSeconds != null
    ? formatDuration(event.durationSeconds)
    : (!answered ? callOutcome(status, '') : null)

  return (
    <div className="my-1 flex justify-center">
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span>{label}</span>
        {detail && <span className="opacity-70">· {detail}</span>}
        <span className="opacity-60">· {formatTime(event.createdAt)}</span>
      </span>
    </div>
  )
}

function PaymentEventRow({ event }: { event: InboxEvent }) {
  const amount = event.amountCents != null
    ? formatMoney(event.amountCents, event.currency ?? 'EUR')
    : null
  return (
    <div className="my-1 flex justify-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span>Payment received</span>
        {amount && <span className="font-semibold">· {amount}</span>}
        <span className="opacity-60">· {formatTime(event.createdAt)}</span>
      </span>
    </div>
  )
}

/** Map a non-answered Twilio DialCallStatus to a short human label. */
function callOutcome(status: string, fallback: string): string {
  switch (status) {
    case 'busy': return 'Busy'
    case 'no-answer': return 'No answer'
    case 'failed': return 'Failed'
    case 'canceled': return 'Canceled'
    default: return fallback
  }
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountCents / 100)
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`
  }
}

function DateSeparator({ day }: { day: string }) {
  return (
    <div className="my-4 flex items-center justify-center">
      <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
        {day}
      </span>
    </div>
  )
}

function MessageBubble({ m, channel, onRetry }: {
  m: InboxMessage
  channel: Channel
  onRetry: (messageId: number) => void
}) {
  const isOut = m.direction === 'OUTBOUND'
  const failed = isOut && (m.status === 'FAILED' || m.status === 'failed' || m.status === 'undelivered' || (m.error != null && m.error !== ''))
  const canRetry = failed && m.id > 0
  const [retrying, setRetrying] = useState(false)
  const doRetry = async () => {
    setRetrying(true)
    try { await onRetry(m.id) } finally { setRetrying(false) }
  }

  const outboundBg = channel === 'WHATSAPP' ? 'bg-emerald-600' : 'bg-sky-600'
  const outboundFailedBg = 'bg-rose-100 text-rose-900 border border-rose-200'

  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
        isOut
          ? (failed ? outboundFailedBg : `${outboundBg} text-white`)
          : 'bg-white text-slate-900 border border-slate-200'
      }`}>
        {/* Outbound only: which team member sent it (shared inbox). The
            inbound sender is obvious from the conversation header, so we
            don't repeat it on every incoming bubble. */}
        {isOut && m.sentByUserName && (
          <p className={`mb-0.5 text-[11px] font-semibold ${failed ? 'text-rose-700' : 'text-white/85'}`}>
            {m.sentByUserName}
          </p>
        )}
        <MessageText body={m.body ?? ''} out={isOut} />
        <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
          isOut ? (failed ? 'text-rose-800' : 'text-white/70') : 'text-slate-400'
        }`}>
          <span>{formatTime(m.createdAt)}</span>
          {failed && m.error ? <span>· {m.error}</span> : null}
          {isOut && !failed && <DeliveryTick status={m.status} />}
        </p>
        {canRetry && (
          <div className="mt-1 flex items-center justify-end gap-2">
            <span className="text-[10px] font-semibold text-rose-700">Not delivered</span>
            <button
              type="button"
              onClick={doRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {retrying ? 'Retrying…' : 'Retry'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * WhatsApp-style delivery indicator for OUTBOUND messages.
 *   queued / sending  → single hollow tick
 *   sent              → single tick
 *   delivered         → double tick
 *   read              → double tick, blue
 *   undelivered       → single tick, amber
 */
function DeliveryTick({ status }: { status: string | null }) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="read" />
  }
  if (s === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5" aria-label="delivered" />
  }
  if (s === 'sent') {
    return <Check className="h-3.5 w-3.5" aria-label="sent" />
  }
  if (s === 'undelivered') {
    return <Check className="h-3.5 w-3.5 text-amber-300" aria-label="undelivered" />
  }
  if (s === 'queued' || s === 'sending' || s === 'accepted' || s === 'scheduled') {
    return <Check className="h-3.5 w-3.5 opacity-60" aria-label="queued" />
  }
  return null
}

// ───────────────────────────────────────────────────────────────────
// Composer
// ───────────────────────────────────────────────────────────────────

function Composer({
  canReply, capabilities, channel, sending, draft, error, cooldownSecondsLeft, onChange, onSend,
}: {
  canReply: boolean
  capabilities: InboxCapabilities | null
  channel: Channel
  sending: boolean
  draft: string
  error: string | null
  cooldownSecondsLeft: number
  onChange: (v: string) => void
  onSend: () => void
}) {
  const sendBg = channel === 'WHATSAPP' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-sky-600 hover:bg-sky-700'
  const cooling = cooldownSecondsLeft > 0
  const disabled = !canReply || sending || cooling || draft.trim() === ''

  return (
    <footer className="border-t border-slate-100 bg-white/80 px-5 py-4 backdrop-blur">
      {!canReply && capabilities && (
        <p className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {channel === 'WHATSAPP'
            ? 'WhatsApp sender is not configured — set TWILIO_WHATSAPP_FROM to enable replies.'
            : 'SMS sender is not configured — set TWILIO_SMS_FROM (and buy a Twilio SMS number) to enable replies.'}
        </p>
      )}
      {cooling && (
        <p className="mb-2 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-900">
            {cooldownSecondsLeft}
          </span>
          Too many repeated messages. Wait {cooldownSecondsLeft}s to avoid duplicates.
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            // Enter sends; Shift+Enter inserts a newline (chat-standard UX).
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              onSend()
            }
          }}
          rows={2}
          disabled={!canReply || sending}
          placeholder={canReply
            ? `Reply via ${channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}… (Shift+Enter for newline)`
            : 'Replies disabled — sender not configured.'}
          className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-inner outline-none transition focus:border-slate-400 disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className={`inline-flex h-10 items-center gap-1.5 rounded-2xl px-4 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80 ${sendBg}`}
        >
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : cooling ? `Wait ${cooldownSecondsLeft}s` : 'Send'}
        </button>
      </div>
      {error && !cooling && (
        <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>
      )}
    </footer>
  )
}

// ───────────────────────────────────────────────────────────────────
// New conversation dialog
// ───────────────────────────────────────────────────────────────────

function NewConversationDialog({
  capabilities, onClose, onCreated,
}: {
  capabilities: InboxCapabilities | null
  onClose: () => void
  onCreated: (thread: InboxThread) => void
}) {
  const canWa = capabilities?.canSendWhatsapp ?? false
  const canSms = capabilities?.canSendSms ?? false

  const [client, setClient] = useState<Client | null>(null)
  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<Channel>(canWa ? 'WHATSAPP' : canSms ? 'SMS' : 'WHATSAPP')
  const [firstMessage, setFirstMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Start a new conversation</h3>
            <p className="text-[11px] text-slate-500">Reach a client by WhatsApp or SMS.</p>
          </div>
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
              <ChannelChoice
                channel="WHATSAPP"
                active={channel === 'WHATSAPP'}
                enabled={canWa}
                onSelect={() => setChannel('WHATSAPP')}
              />
              <ChannelChoice
                channel="SMS"
                active={channel === 'SMS'}
                enabled={canSms}
                onSelect={() => setChannel('SMS')}
              />
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

function ChannelChoice({
  channel, active, enabled, onSelect,
}: {
  channel: Channel
  active: boolean
  enabled: boolean
  onSelect: () => void
}) {
  const wa = channel === 'WHATSAPP'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? (wa ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-sky-500 bg-sky-50 text-sky-800')
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {wa ? <MessageCircle className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
      {wa ? 'WhatsApp' : 'SMS'}
      {!enabled && (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700">off</span>
      )}
    </button>
  )
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function groupThreads(threads: InboxThread[]): ThreadGroup[] {
  const map = new Map<string, ThreadGroup>()
  for (const t of threads) {
    // Group by client when we have one (so the same person across channels
    // collapses into one row), else fall back to the raw phone.
    const key = t.peerClientId != null ? `client:${t.peerClientId}` : `phone:${t.peerPhone}`
    const existing = map.get(key)
    const entry = { channel: t.channel as Channel, thread: t }
    if (!existing) {
      map.set(key, {
        key,
        clientId: t.peerClientId,
        clientName: t.peerClientName,
        peerName: t.peerName,
        phone: t.peerPhone,
        channels: [entry],
        latestAt: t.lastMessageAt,
        latestPreview: t.lastMessagePreview,
        latestDirection: t.lastMessageDirection,
        latestSenderName: t.lastMessageSenderName,
        totalUnread: t.unreadCount,
      })
    } else {
      existing.channels.push(entry)
      if (!existing.peerName && t.peerName) existing.peerName = t.peerName
      if (new Date(t.lastMessageAt) > new Date(existing.latestAt)) {
        existing.latestAt = t.lastMessageAt
        existing.latestPreview = t.lastMessagePreview
        existing.latestDirection = t.lastMessageDirection
        existing.latestSenderName = t.lastMessageSenderName
      }
      existing.totalUnread += t.unreadCount
    }
  }
  // Stable channel order inside each group: WhatsApp first, SMS second.
  for (const g of map.values()) {
    g.channels.sort((a) => a.channel === 'WHATSAPP' ? -1 : 1)
  }
  return Array.from(map.values()).sort((a, b) =>
    new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
}

const AVATAR_PALETTE: { bg: string; text: string }[] = [
  { bg: 'bg-rose-100',     text: 'text-rose-700' },
  { bg: 'bg-amber-100',    text: 'text-amber-700' },
  { bg: 'bg-emerald-100',  text: 'text-emerald-700' },
  { bg: 'bg-sky-100',      text: 'text-sky-700' },
  { bg: 'bg-violet-100',   text: 'text-violet-700' },
  { bg: 'bg-fuchsia-100',  text: 'text-fuchsia-700' },
  { bg: 'bg-indigo-100',   text: 'text-indigo-700' },
  { bg: 'bg-teal-100',     text: 'text-teal-700' },
  { bg: 'bg-orange-100',   text: 'text-orange-700' },
]

function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash * 31) + seed.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function getInitials(value: string): string {
  const parts = (value || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    const p = parts[0]
    // For phone-only display ("+34664…"), pick the last 2 digits so it stays
    // visually distinctive across different numbers.
    if (/^\+?\d/.test(p)) {
      const digits = p.replace(/\D/g, '')
      return digits.slice(-2) || '?'
    }
    return p.slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
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
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (sameDay(d, today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
