import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Toast } from '@/components/Toast'
import { ROLE_LABELS } from '@/constants/config'
import { userService } from '@/services/userService'
import { useAuth } from '@/context/AuthContext'
import type { Usuario } from '@/types'
import { ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'

const AVATAR_COLORS: Record<string, string> = {
  admin: 'bg-slate-900 text-white',
  manager: 'bg-violet-100 text-violet-700',
  jeweler: 'bg-amber-100 text-amber-700',
  sales: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-sky-100 text-sky-700',
}

type CreateRole = 'ADMIN' | 'MANAGER' | 'JEWELER' | 'SALES' | 'VIEWER'

const BLANK: { name: string; email: string; role: CreateRole } = {
  name: '', email: '', role: 'SALES',
}

function computeAvatar(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export function UsersPage() {
  const { user: currentUser, refreshUser } = useAuth()
  const currentUserId = currentUser ? String(currentUser.id) : null

  const [users, setUsers] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdUser, setCreatedUser] = useState<{ id: string; name: string; role: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletedUser, setDeletedUser] = useState<{ id: string; name: string; email: string } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<Usuario | null>(null)
  const [errorToast, setErrorToast] = useState<{ id: string; title: string; description: string } | null>(null)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)

  useEffect(() => {
    userService.getAll().then((data) => { setUsers(data); setLoading(false) })
  }, [])

  const toggleStatus = async (id: string, current: Usuario['status']) => {
    const next = current === 'active' ? 'inactive' : 'active'
    await userService.updateStatus(id, next)
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: next } : u))
  }

  const confirmDelete = async () => {
    const u = confirmTarget
    if (!u) return
    setDeletingId(u.id)
    try {
      await userService.delete(u.id)
      setUsers(prev => prev.filter(x => x.id !== u.id))
      setDeletedUser({ id: u.id, name: u.name, email: u.email })
      setConfirmTarget(null)
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err ?? '')
      console.error('Delete user failed:', rawMsg)
      const friendlyMsg =
        rawMsg === 'Failed to fetch'
          ? "Can't reach the server. Please contact the administrator."
          : rawMsg || 'Please contact the administrator.'
      setErrorToast({
        id: `${u.id}-${Date.now()}`,
        title: 'Failed to delete user',
        description: friendlyMsg,
      })
      setConfirmTarget(null)
    } finally {
      setDeletingId(null)
    }
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

  if (loading) return <UsersSkeleton />

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
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select value={form.role} className={inputCls}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateRole }))}>
                  <option value="ADMIN">Administrator</option>
                  <option value="MANAGER">Store Manager</option>
                  <option value="JEWELER">Jeweler</option>
                  <option value="SALES">Sales</option>
                  <option value="VIEWER">Viewer</option>
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

            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              We'll email an invitation link so the user can set their own password. The link is one-time use and expires in 24 hours.
            </p>

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
            {u.photo ? (
              <img src={u.photo} alt={u.name}
                className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />
            ) : (
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${AVATAR_COLORS[u.role]}`}>
                {u.avatar}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{u.name}</p>
              <p className="text-sm text-slate-500">{u.email}</p>
              {u.bio && (
                <p className="mt-1 text-xs leading-snug text-slate-500 line-clamp-2">{u.bio}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {ROLE_LABELS[u.role]}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${u.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {u.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              <Button variant="outline" size="lg" onClick={() => setEditingUser(u)}>
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit profile
              </Button>
              <Button variant="outline" size="lg" onClick={() => toggleStatus(u.id, u.status)}>
                {u.status === 'active' ? 'Disable' : 'Enable'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setConfirmTarget(u)}
                disabled={u.id === currentUserId || deletingId === u.id}
                title={u.id === currentUserId ? "You can't delete your own account" : 'Delete user'}
                className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {deletingId === u.id ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {createdUser && (
        <Toast
          key={`created-${createdUser.id}`}
          title="User created · invitation sent"
          description={`${createdUser.name} · ${createdUser.role}`}
          onClose={() => setCreatedUser(null)}
        />
      )}

      {deletedUser && (
        <Toast
          key={`deleted-${deletedUser.id}`}
          title="User deleted"
          description={`${deletedUser.name} · ${deletedUser.email}`}
          onClose={() => setDeletedUser(null)}
        />
      )}

      {errorToast && (
        <Toast
          key={`error-${errorToast.id}`}
          variant="error"
          title={errorToast.title}
          description={errorToast.description}
          onClose={() => setErrorToast(null)}
        />
      )}

      {editingUser && (
        <EditProfileDialog
          user={editingUser}
          isSelf={editingUser.id === currentUserId}
          onCancel={() => setEditingUser(null)}
          onSaved={async (updated) => {
            setUsers(prev => prev.map(x => x.id === updated.id ? updated : x))
            // If the admin just edited their OWN profile, refresh the auth
            // context so the sidebar etc. pick up the new photo/bio.
            if (updated.id === currentUserId) await refreshUser()
            setEditingUser(null)
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        variant="danger"
        title="Delete this user?"
        description={
          confirmTarget && (
            <span>
              You're about to permanently delete{' '}
              <span className="font-semibold text-slate-800">{confirmTarget.name}</span>{' '}
              <span className="text-slate-400">({confirmTarget.email})</span>.
              <br />
              This action cannot be undone.
            </span>
          )
        }
        confirmLabel="Delete user"
        cancelLabel="Cancel"
        loading={!!deletingId}
        onConfirm={confirmDelete}
        onCancel={() => !deletingId && setConfirmTarget(null)}
      />
    </Card>
  )
}

function EditProfileDialog({
  user,
  isSelf,
  onCancel,
  onSaved,
}: {
  user: Usuario
  isSelf: boolean
  onCancel: () => void
  onSaved: (u: Usuario) => void | Promise<void>
}) {
  const [name, setName] = useState(user.name)
  const [avatar, setAvatar] = useState(user.avatar ?? '')
  const [bio, setBio] = useState(user.bio ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')
  const [photo, setPhoto] = useState<string | null>(user.photo ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await userService.updateProfile(user.id, { name, avatar, bio, photo, phone: phone.trim() || null })
      await onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isSelf ? 'Edit my profile' : `Edit ${user.name}'s profile`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Customers see the photo and bio on the share link.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Photo */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Profile photo</label>
            <input ref={photoInputRef} id={`edit-photo-${user.id}`} type="file" accept="image/*"
              onChange={handlePhotoChange} className="hidden" />
            {!photo ? (
              <label htmlFor={`edit-photo-${user.id}`}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white">
                <ImagePlus className="h-4 w-4 shrink-0 text-slate-400" />
                <span>Choose photo</span>
              </label>
            ) : (
              <div className="flex items-center gap-4">
                <img src={photo} alt="Profile" className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white shadow-sm" />
                <div className="flex flex-col gap-2">
                  <label htmlFor={`edit-photo-${user.id}`}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                    <ImagePlus className="h-3.5 w-3.5" /> Change
                  </label>
                  <button type="button" onClick={handleRemovePhoto}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-50">
                    <X className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">Display name</label>
            <input type="text" value={name} className={inputCls}
              onChange={e => setName(e.target.value)} placeholder="Full name" />
          </div>

          {/* Initials */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">
              Initials
              <span className="ml-2 text-xs font-normal text-slate-500">shown in compact lists (max 5)</span>
            </label>
            <input type="text" value={avatar} maxLength={5}
              className={`${inputCls} w-32 uppercase tracking-wide`}
              onChange={e => setAvatar(e.target.value)} placeholder="MD" />
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">
              Short biography
              <span className="ml-2 text-xs font-normal text-slate-500">visible to customers</span>
            </label>
            <textarea rows={4} value={bio ?? ''} className={`${inputCls} resize-y`}
              onChange={e => setBio(e.target.value)}
              placeholder="A few lines about experience, specialties, etc." />
          </div>

          {/* WhatsApp phone — needed so the system can text the user when one
              of their quotes is approved (full international format, no
              "whatsapp:" prefix; e.g. "+34664577327"). */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-900">
              WhatsApp phone
              <span className="ml-2 text-xs font-normal text-slate-500">
                receives the share link when their quotes are approved
              </span>
            </label>
            <input
              type="tel"
              inputMode="tel"
              value={phone ?? ''}
              onChange={e => setPhone(e.target.value)}
              placeholder="+34664577327"
              className={inputCls}
            />
            <p className="text-[11px] text-slate-400">
              Full international format with country code. Internal only — never shown to customers.
            </p>
          </div>

          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="text-white"
            style={{ backgroundColor: 'var(--theme-primary)' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function UsersSkeleton() {
  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-64 bg-slate-100" />
          </div>
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
      </CardHeader>
      <CardContent className="divide-y divide-slate-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-4 py-5 md:flex-row md:items-center">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56 bg-slate-100" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-20 bg-slate-100" />
              <Skeleton className="h-6 w-16 bg-slate-100" />
              <Skeleton className="h-9 w-20 rounded-xl bg-slate-100" />
              <Skeleton className="h-9 w-20 rounded-xl bg-slate-100" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
