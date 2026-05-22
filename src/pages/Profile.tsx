import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { userService } from '@/services/userService'
import { Camera, Check, ImagePlus, User, X } from 'lucide-react'
import { useRef, useState } from 'react'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Store Manager',
  jeweler: 'Jeweler',
  sales: 'Sales',
  viewer: 'Viewer',
}

const AVATAR_MAX = 5

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [avatar, setAvatar] = useState(user?.avatar ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [photo, setPhoto] = useState<string | null>(user?.photo ?? null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  if (!user) return null

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
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await userService.updateProfile(String(user.id), { name, avatar, bio, photo })
      await refreshUser()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <User className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">My profile</CardTitle>
              <p className="text-sm text-slate-500">
                Customers see your photo and bio on the quotes you create. Internal teammates also see them on the quote list.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Photo */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Profile photo</label>
            <input ref={photoInputRef} id="profile-photo" type="file" accept="image/*"
              onChange={handlePhotoChange} className="hidden" />
            <input ref={cameraInputRef} id="profile-camera" type="file" accept="image/*"
              capture="environment" onChange={handlePhotoChange} className="hidden" />

            {!photo ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label htmlFor="profile-camera"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:hidden">
                  <Camera className="h-5 w-5 shrink-0 text-slate-400" />
                  <span>Take photo</span>
                </label>
                <label htmlFor="profile-photo"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:col-span-2">
                  <ImagePlus className="h-5 w-5 shrink-0 text-slate-400" />
                  <span>Choose photo from files</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <img src={photo} alt="Profile" className="h-24 w-24 rounded-2xl object-cover ring-2 ring-white shadow-sm" />
                <div className="flex flex-col gap-2">
                  <label htmlFor="profile-photo"
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
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Display name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Marie Dubois"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          {/* Avatar initials */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">
              Initials / icon
              <span className="ml-2 text-xs font-normal text-slate-500">shown in compact lists (max {AVATAR_MAX} chars)</span>
            </label>
            <input
              type="text"
              value={avatar}
              maxLength={AVATAR_MAX}
              onChange={e => setAvatar(e.target.value)}
              placeholder="MD"
              className="w-32 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">
              Short biography
              <span className="ml-2 text-xs font-normal text-slate-500">visible to customers on the quote share link</span>
            </label>
            <textarea
              rows={4}
              value={bio ?? ''}
              onChange={e => setBio(e.target.value)}
              placeholder="A few lines about your experience, specialties, etc."
              className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          {/* Read-only meta */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Email</p>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{user.email}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Role</p>
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}
              className="rounded-2xl text-white"
              style={{ backgroundColor: 'var(--theme-primary)' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
            {error && (
              <span className="text-sm font-semibold text-rose-600">{error}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ProfilePage
