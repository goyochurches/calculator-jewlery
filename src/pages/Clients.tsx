import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { clientService } from '@/services/clientService'
import type { Client } from '@/types'
import { Check, Loader2, Mail, Pencil, Phone, Plus, Search, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

type Draft = Omit<Client, 'id' | 'createdAt'>

const BLANK: Draft = { name: '', surname: '', phone: '', email: '' }

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  // Inline create panel
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState<Draft>({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Per-card edit
  const [editId, setEditId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Client | null>(null)

  const reqIdRef = useRef(0)

  const refresh = () => {
    setLoading(true)
    clientService.list()
      .then(setClients)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [])

  // Debounced search
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const id = ++reqIdRef.current
      setSearching(true)
      const promise = query.trim()
        ? clientService.search(query.trim())
        : clientService.list()
      promise
        .then(rows => {
          // ignore stale responses
          if (id === reqIdRef.current) setClients(rows)
        })
        .catch(console.error)
        .finally(() => {
          if (id === reqIdRef.current) setSearching(false)
        })
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query])

  const stats = useMemo(() => {
    const total = clients.length
    const withEmail = clients.filter(c => !!c.email).length
    const withPhone = clients.filter(c => !!c.phone).length
    return { total, withEmail, withPhone }
  }, [clients])

  const submitNew = async () => {
    if (!createDraft.name.trim()) { setCreateError('Name is required'); return }
    setSaving(true); setCreateError(null)
    try {
      const created = await clientService.create({
        name: createDraft.name.trim(),
        surname: createDraft.surname?.trim() || null,
        phone: createDraft.phone?.trim() || null,
        email: createDraft.email?.trim() || null,
      })
      setClients(prev => [created, ...prev])
      setCreateDraft({ ...BLANK })
      setShowCreate(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to save client')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editDraft) return
    if (!editDraft.name?.trim()) return
    const updated = await clientService.update(editDraft.id, {
      name: editDraft.name.trim(),
      surname: editDraft.surname?.trim() || null,
      phone: editDraft.phone?.trim() || null,
      email: editDraft.email?.trim() || null,
    })
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
    setEditId(null); setEditDraft(null)
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this client? Existing quotes will keep their saved client name.')) return
    await clientService.delete(id)
    setClients(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
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
              placeholder="Search by name, surname or email…"
              className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-9 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-80"
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

      {/* ── Stats ───────────────────────────────────────────────────────── */}
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

      {/* ── List / grid ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-[24px] bg-slate-100" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState query={query} onAdd={() => setShowCreate(true)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map(c => {
            const isEditing = editId === c.id && editDraft
            if (isEditing) {
              return (
                <Card key={c.id} className="rounded-[24px] border border-violet-200 bg-violet-50/40">
                  <CardContent className="space-y-3 p-5">
                    <Field label="Name *" value={editDraft.name ?? ''} onChange={v => setEditDraft(p => p && { ...p, name: v })} />
                    <Field label="Surname" value={editDraft.surname ?? ''} onChange={v => setEditDraft(p => p && { ...p, surname: v })} />
                    <Field label="Phone" value={editDraft.phone ?? ''} onChange={v => setEditDraft(p => p && { ...p, phone: v })} />
                    <Field label="Email" value={editDraft.email ?? ''} onChange={v => setEditDraft(p => p && { ...p, email: v })} type="email" />
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="rounded-xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }} onClick={saveEdit}>
                        <Check className="mr-1.5 h-3.5 w-3.5" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl text-slate-500" onClick={() => { setEditId(null); setEditDraft(null) }}>
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            return (
              <Card key={c.id} className="group rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-base font-semibold uppercase text-violet-700">
                      {(c.name?.[0] ?? '?')}{(c.surname?.[0] ?? '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {c.name}{c.surname ? ` ${c.surname}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.createdAt ? `Added ${new Date(c.createdAt).toLocaleDateString()}` : 'Client #' + c.id}
                      </p>
                    </div>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => { setEditId(c.id); setEditDraft({ ...c }) }}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-violet-50 hover:text-violet-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5 text-sm">
                    <ContactLine icon={Mail} value={c.email} href={c.email ? `mailto:${c.email}` : undefined} />
                    <ContactLine icon={Phone} value={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
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

function ContactLine({ icon: Icon, value, href }: { icon: React.ElementType; value: string | null | undefined; href?: string }) {
  const Inner = (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className={`truncate ${value ? 'text-slate-700' : 'text-slate-300'}`}>
        {value || '—'}
      </span>
    </div>
  )
  if (href && value) {
    return (
      <a href={href} className="block hover:text-slate-900" onClick={e => e.stopPropagation()}>
        {Inner}
      </a>
    )
  }
  return Inner
}

function EmptyState({ query, onAdd }: { query: string; onAdd: () => void }) {
  return (
    <Card className="rounded-[30px] border border-dashed border-slate-300 bg-slate-50/50">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700">
            {query ? `No clients match “${query}”` : 'No clients yet'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {query ? 'Try a different name, surname or email.' : 'Add your first client to start linking quotes.'}
          </p>
        </div>
        {!query && (
          <Button onClick={onAdd} className="rounded-2xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add client
          </Button>
        )}
      </CardContent>
    </Card>
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
