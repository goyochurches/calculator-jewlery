import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { clientService, type ClientSummary } from '@/services/clientService'
import { NoticeDialog } from '@/components/NoticeDialog'
import type { Client } from '@/types'
import {
  Check, ChevronLeft, ChevronRight, FileText, Loader2, Mail, Pencil, Phone,
  Plus, Search, Trash2, UserPlus, X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Draft = Omit<Client, 'id' | 'createdAt'>
const BLANK: Draft = { name: '', surname: '', phone: '', email: '', preferredChannel: 'SMS', birthday: '', anniversary: '', notes: '' }

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const DEFAULT_PAGE_SIZE = 25

export function ClientsPage() {
  const navigate = useNavigate()

  // ── Server-side pagination state — same pattern as QuotesList/StockList,
  // so the page stays fast as the client list keeps growing. ──────────────
  const [clients, setClients] = useState<Client[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const [query, setQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [searching, setSearching] = useState(false)

  // Inline create panel
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Per-row edit
  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Client | null>(null)
  const [notice, setNotice] = useState<{ title: string; description?: string } | null>(null)

  const [stats, setStats] = useState<ClientSummary>({ total: 0, withEmail: 0, withPhone: 0 })

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // Reset to first page when search / page-size changes
  useEffect(() => { setPage(0) }, [debouncedSearch, pageSize])

  // Fetch the current page from the server — also called directly after
  // create/delete so the table stays in sync without a full page reload.
  const refresh = useCallback(() => {
    setLoading(true)
    setSearching(!!debouncedSearch.trim())
    return clientService.getPage({ page, size: pageSize, q: debouncedSearch || undefined })
      .then(({ items, totalPages: tp, totalElements: te }) => {
        setClients(items)
        setTotalPages(tp)
        setTotalElements(te)
      })
      .catch(console.error)
      .finally(() => { setLoading(false); setSearching(false) })
  }, [page, pageSize, debouncedSearch])

  useEffect(() => { refresh() }, [refresh])

  const loadStats = () => clientService.summary().then(setStats).catch(console.error)
  useEffect(() => { loadStats() }, [])

  const pageStart = page * pageSize
  const pageEnd = Math.min(pageStart + pageSize, totalElements)

  const submitNew = async () => {
    if (!createDraft.name.trim()) { setCreateError('Name is required'); return }
    setSaving(true); setCreateError(null)
    try {
      await clientService.create({
        name: createDraft.name.trim(),
        surname: createDraft.surname?.trim() || null,
        phone: createDraft.phone?.trim() || null,
        email: createDraft.email?.trim() || null,
        preferredChannel: createDraft.preferredChannel || 'SMS',
        birthday: createDraft.birthday?.trim() || null,
        anniversary: createDraft.anniversary?.trim() || null,
        notes: createDraft.notes?.trim() || null,
      })
      setCreateDraft({ ...BLANK })
      setShowCreate(false)
      refresh()
      loadStats()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to save client')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editDraft) return
    if (!editDraft.name?.trim()) return
    try {
      const updated = await clientService.update(editDraft.id, {
        name: editDraft.name.trim(),
        surname: editDraft.surname?.trim() || null,
        phone: editDraft.phone?.trim() || null,
        email: editDraft.email?.trim() || null,
        preferredChannel: editDraft.preferredChannel || 'SMS',
        // Not editable from this compact row — carry the existing values
        // through unchanged so a quick contact-info edit here doesn't wipe
        // dates/notes set from the client detail page.
        birthday: editDraft.birthday ?? null,
        anniversary: editDraft.anniversary ?? null,
        notes: editDraft.notes ?? null,
      })
      setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
      setEditId(null); setEditDraft(null)
      loadStats()
    } catch (e) {
      // Most likely a duplicate phone/email — surface the backend message.
      setNotice({ title: "Couldn't save the client", description: e instanceof Error ? e.message : 'Failed to save client' })
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this client? Existing quotes will keep their saved client name.')) return
    await clientService.delete(id)
    refresh()
    loadStats()
  }

  return (
    <div className="space-y-6">
      <NoticeDialog
        open={notice !== null}
        title={notice?.title ?? ''}
        description={notice?.description}
        variant="error"
        onClose={() => setNotice(null)}
      />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Browse, search, and manage the customers used by the Quote Builder.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
            )}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, surname, email or phone…"
              className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-9 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-96"
            />
          </div>
          <Button
            className="rounded-2xl text-white"
            style={{ backgroundColor: 'var(--theme-primary)' }}
            onClick={() => { setShowCreate(true); setCreateError(null) }}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add client
          </Button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total clients" value={stats.total} />
        <StatCard label="With email" value={stats.withEmail} hint={pct(stats.withEmail, stats.total)} />
        <StatCard label="With phone" value={stats.withPhone} hint={pct(stats.withPhone, stats.total)} />
      </section>

      {/* ── Inline create panel ─────────────────────────────────────────── */}
      {showCreate && (
        <Card className="rounded-[24px] border border-violet-200 bg-violet-50/40 shadow-[0_20px_60px_rgba(139,92,246,0.12)]">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">New client</h2>
              <button
                onClick={() => { setShowCreate(false); setCreateDraft({ ...BLANK }); setCreateError(null) }}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {createError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {createError}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name *" value={createDraft.name} onChange={v => setCreateDraft(d => ({ ...d, name: v }))} placeholder="María" />
              <Field label="Surname" value={createDraft.surname ?? ''} onChange={v => setCreateDraft(d => ({ ...d, surname: v }))} placeholder="García" />
              <Field label="Phone" value={createDraft.phone ?? ''} onChange={v => setCreateDraft(d => ({ ...d, phone: v }))} placeholder="+34 600 000 000" />
              <Field label="Email" value={createDraft.email ?? ''} onChange={v => setCreateDraft(d => ({ ...d, email: v }))} placeholder="maria@example.com" type="email" />
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Preferred channel</span>
                <select
                  value={createDraft.preferredChannel ?? 'SMS'}
                  onChange={e => setCreateDraft(d => ({ ...d, preferredChannel: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                >
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </label>
              <Field label="Birthday" value={createDraft.birthday ?? ''} onChange={v => setCreateDraft(d => ({ ...d, birthday: v }))} type="date" />
              <Field label="Anniversary" value={createDraft.anniversary ?? ''} onChange={v => setCreateDraft(d => ({ ...d, anniversary: v }))} type="date" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }} onClick={submitNew} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Create client'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <EmptyState query={query} onAdd={() => setShowCreate(true)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <Th>Client</Th>
                    <Th>Phone</Th>
                    <Th>Email</Th>
                    <Th>Added</Th>
                    <Th className="text-right pr-6">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => {
                    const isEditing = editId === c.id && editDraft
                    if (isEditing) {
                      return (
                        <tr key={c.id} className="border-b border-violet-100 bg-violet-50/30">
                          <td className="px-3 py-2">
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                value={editDraft.name ?? ''}
                                onChange={e => setEditDraft(p => p && { ...p, name: e.target.value })}
                                placeholder="Name"
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-400"
                              />
                              <input
                                value={editDraft.surname ?? ''}
                                onChange={e => setEditDraft(p => p && { ...p, surname: e.target.value })}
                                placeholder="Surname"
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-400"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editDraft.phone ?? ''}
                              onChange={e => setEditDraft(p => p && { ...p, phone: e.target.value })}
                              placeholder="+34…"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-400"
                            />
                            <select
                              value={editDraft.preferredChannel ?? 'SMS'}
                              onChange={e => setEditDraft(p => p && { ...p, preferredChannel: e.target.value })}
                              title="Preferred channel for links"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-slate-400"
                            >
                              <option value="SMS">SMS</option>
                              <option value="WHATSAPP">WhatsApp</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="email"
                              value={editDraft.email ?? ''}
                              onChange={e => setEditDraft(p => p && { ...p, email: e.target.value })}
                              placeholder="email@…"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-slate-400"
                            />
                          </td>
                          <td className="px-6 py-2 text-slate-400 text-xs">
                            {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setEditId(null); setEditDraft(null) }}><X className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/clients/${c.id}`)}
                        className="group cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-xs font-semibold uppercase text-violet-700">
                              {(c.name?.[0] ?? '?')}{(c.surname?.[0] ?? '')}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {c.name}{c.surname ? ` ${c.surname}` : ''}
                              </p>
                              <p className="text-xs text-slate-400">Client #{c.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-slate-700">
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 hover:text-violet-700"
                            >
                              <Phone className="h-3.5 w-3.5 text-slate-400" />
                              {c.phone}
                            </a>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3.5 text-slate-700">
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 hover:text-violet-700"
                            >
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              {c.email}
                            </a>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3.5 text-slate-500 text-xs">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate('/quotes', { state: { presetClient: c } }) }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                              title="New quote for this client"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditId(c.id); setEditDraft({ ...c }) }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-violet-50 hover:text-violet-600"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); remove(c.id) }}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <ChevronRight className="ml-1 h-4 w-4 self-center text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalElements > 0 && (
            <PaginationBar
              page={page + 1}
              totalPages={totalPages}
              pageStart={pageStart}
              pageEnd={pageEnd}
              total={totalElements}
              pageSize={pageSize}
              loading={loading}
              onPageChange={p => setPage(p - 1)}
              onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

function PaginationBar({
  page, totalPages, pageStart, pageEnd, total, pageSize, loading, onPageChange, onPageSizeChange,
}: {
  page: number; totalPages: number; pageStart: number; pageEnd: number; total: number
  pageSize: number; loading?: boolean; onPageChange: (p: number) => void; onPageSizeChange: (size: number) => void
}) {
  const pages = getPageNumbers(page, totalPages)
  const canPrev = page > 1 && !loading
  const canNext = page < totalPages && !loading
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-medium">{pageStart + 1}–{pageEnd} of {total}</span>
        <label className="hidden items-center gap-2 sm:flex">
          <span>Rows</span>
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400">
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={!canPrev} aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) => p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">…</span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${p === page ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={!canNext} aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 ${className ?? ''}`}>
      {children}
    </th>
  )
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
        <UserPlus className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">
          {query ? `No clients match “${query}”` : 'No clients yet'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {query ? 'Try a different name, surname, email or phone.' : 'Add your first client to start linking quotes.'}
        </p>
      </div>
      {!query && (
        <Button onClick={onAdd} className="rounded-2xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Add client
        </Button>
      )}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  )
}

function pct(n: number, total: number): string {
  if (total === 0) return '—'
  return `${Math.round((n / total) * 100)}% of total`
}

export default ClientsPage
