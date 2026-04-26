import { Button } from '@/components/ui/button'
import { passwordSetupService, type SetupTokenInfo } from '@/services/passwordSetupService'
import { CheckCircle2, Eye, EyeOff, Lock, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

type Status = 'loading' | 'invalid' | 'ready' | 'submitting' | 'done'

export default function SetupPasswordPage() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<Status>('loading')
  const [info, setInfo] = useState<SetupTokenInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      setErrorMsg('Missing token in URL.')
      return
    }
    passwordSetupService
      .validate(token)
      .then((res) => {
        setInfo(res)
        setStatus('ready')
      })
      .catch((err: unknown) => {
        setStatus('invalid')
        setErrorMsg(err instanceof Error ? err.message : 'Invalid or expired link.')
      })
  }, [token])

  const validate = () => {
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password.length > 100) return 'Password must be at most 100 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) { setFormError(err); return }
    setFormError(null)
    setStatus('submitting')
    try {
      await passwordSetupService.setPassword(token, password)
      setStatus('done')
    } catch (err: unknown) {
      setStatus('ready')
      setFormError(err instanceof Error ? err.message : 'Failed to set password.')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ backgroundColor: 'var(--theme-tertiary, #f4f1ec)' }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-500 text-2xl shadow-lg shadow-amber-500/30">
            💎
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-600">
            <Sparkles className="h-3 w-3" /> Account setup
          </p>
        </div>

        <div className="rounded-[28px] border border-white/80 bg-white/95 p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          {status === 'loading' && (
            <p className="text-center text-sm text-slate-500">Verifying your setup link…</p>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">This link can't be used</h1>
              <p className="text-sm text-slate-500">
                {errorMsg ?? 'It may have expired or already been used.'}
              </p>
              <p className="text-xs text-slate-400">
                Ask an administrator to invite you again.
              </p>
              <Link
                to="/login"
                className="mt-3 inline-flex items-center text-sm font-semibold text-amber-600 hover:text-amber-700"
              >
                Back to sign in →
              </Link>
            </div>
          )}

          {(status === 'ready' || status === 'submitting') && info && (
            <>
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                Set your password
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Hi <span className="font-semibold text-slate-700">{info.name}</span>,
                choose a password for your account.
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs">
                <p className="font-semibold uppercase tracking-widest text-slate-400">Account email</p>
                <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{info.email}</p>
              </div>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">New password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-amber-200"
                      disabled={status === 'submitting'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Repeat password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-amber-200"
                      disabled={status === 'submitting'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {formError && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {formError}
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full rounded-2xl text-white"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                  disabled={status === 'submitting'}
                >
                  {status === 'submitting' ? 'Saving…' : 'Set password'}
                </Button>

                <p className="text-center text-xs text-slate-400">
                  This link can be used only once and expires 24 hours after it was sent.
                </p>
              </form>
            </>
          )}

          {status === 'done' && info && (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">Password set ✓</h1>
              <p className="text-sm text-slate-500">
                Your account is ready. We've sent a confirmation to{' '}
                <span className="font-semibold text-slate-700">{info.email}</span>.
              </p>
              <Button
                size="lg"
                className="mt-3 w-full rounded-2xl text-white"
                style={{ backgroundColor: 'var(--theme-primary)' }}
                onClick={() => navigate('/login')}
              >
                Go to sign in →
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
