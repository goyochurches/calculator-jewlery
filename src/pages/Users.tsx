import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Toast } from '@/components/Toast'
import { ROLE_LABELS } from '@/constants/config'
import { userService } from '@/services/userService'
import type { Usuario } from '@/types'
import { Plus, X } from 'lucide-react'

const AVATAR_COLORS: Record<string, string> = {
  admin: 'bg-slate-900 text-white',
  analyst: 'bg-emerald-100 text-emerald-700',
  readonly: 'bg-amber-100 text-amber-700',
}

type CreateRole = 'ADMIN' | 'ANALYST' | 'READONLY'

const BLANK: { name: string; email: string; password: string; role: CreateRole } = {
  name: '', email: '', password: '', role: 'ANALYST',
}

function computeAvatar(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export function UsersPage() {
  const [users, setUsers] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdUser, setCreatedUser] = useState<{ id: string; name: string; role: string } | null>(null)

  useEffect(() => {
    userService.getAll().then((data) => { setUsers(data); setLoading(false) })
  }, [])

  const toggleStatus = async (id: string, current: Usuario['status']) => {
    const next = current === 'active' ? 'inactive' : 'active'
    await userService.updateStatus(id, next)
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: next } : u))
  }

  const closeCreate = () => { setShowCreate(false); setForm({ ...BLANK }); setCreateError(null) }

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const avatar = computeAvatar(form.name) || '?'
      const newUser = await userService.create({ ...form, avatar })
      setUsers(prev => [...prev, newUser])
      setCreatedUser({ id: newUser.id, name: newUser.name, role: ROLE_LABELS[newUser.role] ?? newUser.role })
      closeCreate()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400'

  if (loading) return <p className="text-sm text-slate-500">Loading users...</p>

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">Team directory</CardTitle>
            <p className="text-sm text-slate-500">Operational users, access levels and current availability.</p>
          </div>
          {!showCreate && (
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New user
            </Button>
          )}
        </div>
      </CardHeader>

      {showCreate && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">New user</p>
              <button type="button" onClick={closeCreate} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                <input required placeholder="Full name" value={form.name} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                <input required type="email" placeholder="user@example.com" value={form.email} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
                <input required type="password" placeholder="••••••••" value={form.password} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select value={form.role} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateRole }))}>
                  <option value="ADMIN">Administrator</option>
                  <option value="ANALYST">Analyst</option>
                  <option value="READONLY">Read only</option>
                </select>
              </div>
            </div>

            {form.name && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                Avatar:
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white">
                  {computeAvatar(form.name)}
                </span>
              </p>
            )}

            {createError && <p className="text-xs text-rose-600">{createError}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={creating} className="text-white"
                style={{ backgroundColor: 'var(--theme-primary)' }}>
                {creating ? 'Creating...' : 'Create user'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={closeCreate}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      <CardContent className="divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="flex flex-col gap-4 py-5 md:flex-row md:items-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold ${AVATAR_COLORS[u.role]}`}>
              {u.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{u.name}</p>
              <p className="text-sm text-slate-500">{u.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {ROLE_LABELS[u.role]}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {u.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              <Button variant="outline" size="lg" onClick={() => toggleStatus(u.id, u.status)}>
                {u.status === 'active' ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {createdUser && (
        <Toast
          key={createdUser.id}
          title="User created!"
          description={`${createdUser.name} · ${createdUser.role}`}
          onClose={() => setCreatedUser(null)}
        />
      )}
    </Card>
  )
}
