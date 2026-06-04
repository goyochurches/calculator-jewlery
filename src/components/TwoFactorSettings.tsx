import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { twoFactorService } from '@/services/twoFactorService'
import { copyToClipboard } from '@/lib/share'
import QRCode from 'qrcode'
import { Check, Copy, KeyRound, ShieldCheck, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'

type Mode = 'idle' | 'setup' | 'recovery' | 'disabling'

export function TwoFactorSettings() {
  const { user, refreshUser } = useAuth()
  const enabled = !!user?.twoFactorEnabled

  const [mode, setMode] = useState<Mode>('idle')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setMode('idle'); setSecret(''); setQrDataUrl(''); setCode('')
    setRecoveryCodes([]); setError(null); setBusy(false)
  }

  const startSetup = async () => {
    setBusy(true); setError(null)
    try {
      const { secret, otpauthUri } = await twoFactorService.setup()
      setSecret(secret)
      setQrDataUrl(await QRCode.toDataURL(otpauthUri, { width: 220, margin: 1 }))
      setMode('setup')
    } catch {
      setError('Could not start setup. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const confirmEnable = async () => {
    if (code.trim() === '') { setError('Enter the 6-digit code from your app.'); return }
    setBusy(true); setError(null)
    try {
      const { recoveryCodes } = await twoFactorService.enable(code.trim())
      setRecoveryCodes(recoveryCodes)
      setCode('')
      setMode('recovery')
      await refreshUser()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code isn\'t valid. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDisable = async () => {
    if (code.trim() === '') { setError('Enter a current code to turn it off.'); return }
    setBusy(true); setError(null)
    try {
      await twoFactorService.disable(code.trim())
      await refreshUser()
      reset()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code isn\'t valid.')
    } finally {
      setBusy(false)
    }
  }

  const copyRecovery = async () => {
    await copyToClipboard(recoveryCodes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className={`rounded-[30px] border shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${
      enabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
    }`}>
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
            enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </span>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">Two-factor authentication</CardTitle>
            <p className="text-sm text-slate-500">
              {enabled
                ? 'Active — a code from your authenticator app is required at login.'
                : 'Add a second step at login with a free authenticator app. Strongly recommended.'}
            </p>
          </div>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
          }`}>
            {enabled ? 'On' : 'Off'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-6">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* ── Idle: enabled → offer disable; disabled → offer enable ── */}
        {mode === 'idle' && (
          enabled ? (
            <Button onClick={() => { setError(null); setMode('disabling') }}
              className="rounded-2xl bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50">
              Turn off two-factor
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                You'll need a free app like <strong>Google Authenticator</strong>, <strong>Authy</strong> or <strong>1Password</strong>.
              </p>
              <Button onClick={startSetup} disabled={busy}
                className="rounded-2xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
                {busy ? 'Starting…' : 'Set up two-factor'}
              </Button>
            </div>
          )
        )}

        {/* ── Setup: show QR + secret + confirm code ── */}
        {mode === 'setup' && (
          <div className="space-y-4">
            <ol className="space-y-3 text-sm text-slate-600">
              <li><strong>1.</strong> Scan this QR with your authenticator app:</li>
            </ol>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              {qrDataUrl && <img src={qrDataUrl} alt="2FA QR code" className="h-48 w-48" />}
              <p className="text-center text-xs text-slate-500">
                Can't scan? Enter this key manually:
                <button type="button" onClick={() => copyToClipboard(secret)}
                  className="mt-1 block w-full break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[13px] font-semibold text-slate-800 hover:bg-slate-100">
                  {secret}
                </button>
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-900"><strong>2.</strong> Enter the 6-digit code it shows:</label>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={e => setCode(e.target.value)} placeholder="000000"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={confirmEnable} disabled={busy}
                className="rounded-2xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
                {busy ? 'Verifying…' : 'Verify & enable'}
              </Button>
              <button type="button" onClick={reset} className="text-sm font-semibold text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Recovery codes (shown once) ── */}
        {mode === 'recovery' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Two-factor is now <strong>on</strong>. Save these recovery codes somewhere safe — each works once if you ever lose your phone.</span>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-4">
              {recoveryCodes.map(c => (
                <span key={c} className="flex items-center gap-1.5 font-mono text-sm font-semibold text-slate-800">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" /> {c}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={copyRecovery} className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800">
                {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copied</> : <><Copy className="mr-1.5 h-4 w-4" /> Copy codes</>}
              </Button>
              <Button onClick={reset} className="rounded-2xl text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* ── Disable: confirm with a code ── */}
        {mode === 'disabling' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Enter a current 6-digit code (or a recovery code) to turn two-factor off.</p>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={e => setCode(e.target.value)} placeholder="000000"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] outline-none transition focus:border-slate-400 focus:bg-white"
            />
            <div className="flex items-center gap-2">
              <Button onClick={confirmDisable} disabled={busy}
                className="rounded-2xl bg-rose-600 text-white hover:bg-rose-700">
                {busy ? 'Turning off…' : 'Turn off two-factor'}
              </Button>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
                <X className="h-4 w-4" /> Cancel
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
