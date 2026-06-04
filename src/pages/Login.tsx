import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const DEFAULT_LOGO_URL = '/s%26s_logo.png'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Two-step login: 'credentials' first, then 'twofa' if the account has
  // two-factor enabled. `code` holds the 6-digit TOTP (or a recovery code).
  const [step, setStep] = useState<'credentials' | 'twofa'>('credentials')
  const [code, setCode] = useState('')

  // Drop a stale error the second the user starts typing again — otherwise the
  // error sticks visually even though the attempt was a one-off (e.g. accidental
  // Enter, browser autofill of a stale saved password, etc.).
  useEffect(() => {
    if (error) setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, code])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cleanEmail = email.trim()
    const cleanPassword = password   // do NOT trim — passwords may contain
                                     // intentional trailing spaces.
    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both your email and password.')
      return
    }
    if (step === 'twofa' && code.trim() === '') {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await login(cleanEmail, cleanPassword, step === 'twofa' ? code.trim() : undefined)
      if (result.twoFactorRequired) {
        // Password OK — move to the code step.
        setStep('twofa')
        return
      }
      navigate('/')
    } catch {
      setError(step === 'twofa'
        ? 'That code isn\'t valid. Check your authenticator app (or use a recovery code).'
        : 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  function backToCredentials() {
    setStep('credentials')
    setCode('')
    setError('')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--theme-tertiary)' }}
    >
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center mb-8 text-center">
          <img
            src={DEFAULT_LOGO_URL}
            alt="Simone & Son"
            width={84}
            height={84}
            className="mb-4 object-contain"
          />
          <h1 className="font-serif text-2xl font-semibold text-slate-900">Simone &amp; Son</h1>
          <p className="text-sm text-slate-500 mt-1">Jewelry Software</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[24px] shadow-[0_20px_60px_rgba(60,46,96,0.12)] p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {step === 'credentials' ? 'Welcome back' : 'Two-step verification'}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {step === 'credentials'
              ? 'Sign in to continue to your workspace'
              : 'Enter the 6-digit code from your authenticator app.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {step === 'credentials' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                    placeholder="••••••••"
                  />
                </div>
              </>
            )}

            {step === 'twofa' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="code">
                  Authentication code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-center text-lg font-semibold tracking-[0.3em] text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 outline-none transition-all focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]/20"
                  placeholder="000000"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Open Google Authenticator (or your app) and enter the current code. You can also use a one-time recovery code.
                </p>
                <button
                  type="button"
                  onClick={backToCredentials}
                  className="mt-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                >
                  ← Back to sign in
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                    />
                  </svg>
                  <span>{step === 'twofa' ? 'Verifying…' : 'Signing in…'}</span>
                </>
              ) : (
                step === 'twofa' ? 'Verify' : 'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Simone &amp; Son Jewelry Software &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
