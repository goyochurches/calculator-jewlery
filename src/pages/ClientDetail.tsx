import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { QuoteDetailPanel } from '@/components/QuoteDetailPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { clientService } from '@/services/clientService'
import { quotesService } from '@/services/quotesService'
import type { Client, QuoteStatus, SavedQuote } from '@/types'
import { ArrowLeft, FileText, Mail, Phone, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft:    'bg-slate-100 text-slate-600',
  pending:  'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
}
const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft', pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [client, setClient] = useState<Client | null>(null)
  const [quotes, setQuotes] = useState<SavedQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const numericId = Number(id)
    if (Number.isNaN(numericId)) {
      setError('Invalid client id')
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      clientService.getById(numericId),
      quotesService.getByClient(numericId),
    ])
      .then(([c, qs]) => {
        setClient(c)
        setQuotes(qs)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load client'))
      .finally(() => setLoading(false))
  }, [id])

  const stats = useMemo(() => {
    const total = quotes.length
    const totalRevenue = quotes.reduce((sum, q) => sum + (q.total ?? 0), 0)
    const approved = quotes.filter(q => q.status === 'approved').length
    const pending  = quotes.filter(q => q.status === 'pending').length
    return { total, totalRevenue, approved, pending }
  }, [quotes])

  const selectedQuote = quotes.find(q => q.id === selectedId) ?? null

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    try {
      const updated = await quotesService.updateStatus(id, status)
      setQuotes(prev => prev.map(q => q.id === id ? updated : q))
    } catch (e) {
      console.error(e)
    }
  }

  const handleRefreshToken = async (id: string) => {
    try {
      const updated = await quotesService.refreshPublicToken(id)
      setQuotes(prev => prev.map(q => q.id === id ? updated : q))
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 bg-slate-100" />
        <Skeleton className="h-40 w-full rounded-[24px] bg-slate-100" />
        <Skeleton className="h-64 w-full rounded-[24px] bg-slate-100" />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/clients')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </Button>
        <Card className="rounded-[24px] border border-rose-200 bg-rose-50/40">
          <CardContent className="p-6 text-sm text-rose-700">
            {error ?? 'Client not found.'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/clients')} className="gap-2 px-2 text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </Button>

      {/* Header card */}
      <Card className="rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="relative p-6 sm:p-8">
          <div className="absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.18),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/15 text-2xl font-semibold uppercase">
              {(client.name?.[0] ?? '?')}{(client.surname?.[0] ?? '')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Client</p>
              <h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">
                {client.name}{client.surname ? ` ${client.surname}` : ''}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-200">
                {client.email && (
                  <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                    <Mail className="h-3.5 w-3.5" /> {client.email}
                  </a>
                )}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
                    <Phone className="h-3.5 w-3.5" /> {client.phone}
                  </a>
                )}
                {!client.email && !client.phone && (
                  <span className="text-slate-400">No contact info on file</span>
                )}
                {client.createdAt && (
                  <span className="text-slate-400">Added {new Date(client.createdAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total quotes" value={stats.total.toString()} />
        <StatCard label="Approved" value={stats.approved.toString()} />
        <StatCard label="Pending" value={stats.pending.toString()} />
        <StatCard label="Lifetime value" value={`$${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
      </section>

      {/* Quotes table + side panel */}
      <div className={`grid gap-4 ${selectedQuote ? 'xl:grid-cols-[1.4fr_1fr]' : ''}`}>
        <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Quotes for this client</CardTitle>
              <p className="text-sm text-slate-500">
                {quotes.length === 0
                  ? 'No quotes yet.'
                  : `${quotes.length} quote${quotes.length === 1 ? '' : 's'} on file. Click a row to see details.`}
              </p>
            </div>
            <Button
              className="rounded-2xl text-white"
              style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => navigate('/quotes')}
            >
              <FileText className="mr-1.5 h-4 w-4" /> New quote
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {quotes.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <User className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-700">No quotes for this client yet</p>
                <p className="max-w-md text-xs text-slate-500">
                  Open the Quote Builder, search for this client, and the new quote will be linked automatically.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70">
                      <Th>Title</Th>
                      <Th>Date</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Total</Th>
                      <Th>Share link</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => {
                      const isSelected = q.id === selectedId
                      return (
                        <tr
                          key={q.id}
                          onClick={() => setSelectedId(isSelected ? null : q.id)}
                          className={`cursor-pointer border-b border-slate-100 transition-colors last:border-0 ${isSelected ? 'bg-violet-50/60' : 'hover:bg-slate-50/80'}`}
                        >
                          <td className="px-6 py-4 font-semibold text-slate-900">{q.title}</td>
                          <td className="px-6 py-4 text-slate-500">{q.createdAt}</td>
                          <td className="px-6 py-4">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[q.status]}`}>
                              {STATUS_LABELS[q.status]}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-slate-900">
                            ${(q.total ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-4">
                            <CopyShareLinkButton token={q.publicToken} iconOnly={false} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedQuote && (
          <Card className="self-start rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)] xl:sticky xl:top-4">
            <QuoteDetailPanel
              quote={selectedQuote}
              isAdmin={isAdmin}
              onStatusChange={handleStatusChange}
              onRefreshToken={isAdmin ? handleRefreshToken : undefined}
              onClose={() => setSelectedId(null)}
            />
          </Card>
        )}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      </CardContent>
    </Card>
  )
}

export default ClientDetailPage
