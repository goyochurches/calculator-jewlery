import { useAuth } from '@/context/AuthContext'
import { ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const DISMISS_KEY = 'twofa-nudge-dismissed-until'
/** Snooze window after the user dismisses the nudge (~1 month). */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A standing reminder shown on every authenticated page while the signed-in
 * user has NOT enabled two-factor authentication. It's an invitation, not a
 * block — if the user closes it, it stays hidden for ~1 month, then reappears.
 * It also stops rendering on its own the moment they turn 2FA on (because
 * `user.twoFactorEnabled` flips to true).
 */
export function TwoFactorNudge() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Persisted "snoozed until" timestamp — survives reloads and re-logins so a
  // dismiss really lasts a month, not just the session.
  const [snoozed, setSnoozed] = useState(() => {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return Date.now() < until
  })

  // Nothing to nudge if not signed in, already protected, snoozed, or already
  // on the profile page (where they'd enable it).
  if (!user) return null
  if (user.twoFactorEnabled) return null
  if (snoozed) return null
  if (location.pathname === '/profile') return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS))
    setSnoozed(true)
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Protect your account with two-factor authentication
          </p>
          <p className="text-xs text-amber-800">
            Add a free second step at login with an authenticator app — it only takes a minute, and it's optional.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600"
        >
          Set it up
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss for now"
          title="Not now — we'll remind you again in about a month"
          className="flex h-7 w-7 items-center justify-center rounded-full text-amber-600 transition hover:bg-amber-100 hover:text-amber-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
