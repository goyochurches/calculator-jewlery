import { Button } from '@/components/ui/button'
import { clientService } from '@/services/clientService'
import type { Client } from '@/types'
import { Check, ChevronsUpDown, Loader2, Plus, Search, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ClientPickerProps {
  value: Client | null
  onChange: (client: Client | null) => void
  hasError?: boolean
}

/**
 * Combobox-style picker for the Client master table:
 *   - Type to search → debounced backend lookup, shows up to 20 matches
 *   - Pick a client from the dropdown → returned via onChange
 *   - "+ Add new client" opens an inline form (name / surname / phone / email)
 *     that POSTs to /api/clients and selects the newly-created row
 */
export function ClientPicker({ value, onChange, hasError = false }: ClientPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Client[]>([])
  const [searching, setSearching] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState({ name: '', surname: '', phone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounced search
  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      setSearching(true)
      const promise = query.trim()
        ? clientService.search(query.trim())
        : clientService.list()
      promise
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query, open])

  // Click-outside to close
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setShowCreate(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const select = (c: Client) => {
    onChange(c)
    setOpen(false)
    setShowCreate(false)
    setQuery('')
  }

  const submitNew = async () => {
    if (!draft.name.trim()) { setCreateError('Name is required'); return }
    setSaving(true)
    setCreateError(null)
    try {
      const created = await clientService.create({
        name: draft.name.trim(),
        surname: draft.surname.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
      })
      setDraft({ name: '', surname: '', phone: '', email: '' })
      select(created)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to save client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / selected display */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-invalid={hasError}
        className={`flex w-full items-center justify-between rounded-2xl border bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 outline-none transition focus:bg-white ${
          hasError ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-slate-400'
        }`}
      >
        {value ? (
          <span className="flex items-center gap-2 truncate">
            <span className="font-semibold">{value.name}{value.surname ? ` ${value.surname}` : ''}</span>
            {value.email && <span className="text-xs text-slate-500 truncate">· {value.email}</span>}
          </span>
        ) : (
          <span className="text-slate-400">Search or add a client…</span>
        )}
        <span className="ml-2 flex items-center gap-1.5 shrink-0">
          {value && (
            <X
              className="h-4 w-4 text-slate-400 hover:text-slate-700"
              onClick={(e) => { e.stopPropagation(); onChange(null) }}
            />
          )}
          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, surname or email…"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />}
          </div>

          {/* Results */}
          {!showCreate && (
            <>
              <div className="max-h-60 overflow-y-auto">
                {results.length === 0 && !searching && (
                  <div className="px-4 py-6 text-center text-xs text-slate-400">
                    No clients{query ? ` matching "${query}"` : ''} yet.
                  </div>
                )}
                {results.map(c => {
                  const selected = value?.id === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => select(c)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 ${selected ? 'bg-violet-50/60' : ''}`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold uppercase text-violet-700">
                        {c.name?.[0] ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">
                          {c.name}{c.surname ? ` ${c.surname}` : ''}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-violet-600" />}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(true)
                  // Pre-fill name with whatever the user typed
                  if (query.trim()) setDraft(d => ({ ...d, name: query.trim() }))
                }}
                className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                <UserPlus className="h-4 w-4" />
                Add new client{query.trim() ? ` "${query.trim()}"` : ''}
              </button>
            </>
          )}

          {/* Inline create form */}
          {showCreate && (
            <div className="space-y-3 border-t border-slate-100 p-4">
              {createError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {createError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name *" value={draft.name} onChange={v => setDraft(d => ({ ...d, name: v }))} placeholder="María" autoFocus />
                <Field label="Surname" value={draft.surname} onChange={v => setDraft(d => ({ ...d, surname: v }))} placeholder="García" />
                <Field label="Phone" value={draft.phone} onChange={v => setDraft(d => ({ ...d, phone: v }))} placeholder="+34 600 000 000" />
                <Field label="Email" value={draft.email} onChange={v => setDraft(d => ({ ...d, email: v }))} placeholder="maria@example.com" type="email" />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="rounded-xl text-white"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                  onClick={submitNew}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">{saving ? 'Saving…' : 'Create & select'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-slate-500"
                  onClick={() => { setShowCreate(false); setCreateError(null) }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  )
}
