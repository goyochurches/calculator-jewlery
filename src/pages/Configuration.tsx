import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CONFIG } from '@/constants/config'
import { useBrand } from '@/context/BrandContext'
import { useTheme, type ThemeColors } from '@/context/ThemeContext'
import { userService } from '@/services/userService'
import type { Usuario } from '@/types'
import {
  FEATURE_CATALOG,
  parseFeatureFlags,
  serializeFeatureFlags,
  type FeatureFlags,
  type FeatureKey,
} from '@/lib/featureFlags'
import { Upload, X } from 'lucide-react'

const COLOR_ROLES = [
  {
    key: 'primary' as keyof ThemeColors,
    label: 'Primary',
    description: 'Sidebar, dark cards, main brand surfaces',
  },
  {
    key: 'secondary' as keyof ThemeColors,
    label: 'Secondary',
    description: 'Accent badges, highlights, subtle fills',
  },
  {
    key: 'tertiary' as keyof ThemeColors,
    label: 'Tertiary',
    description: 'Background tints, hover states, light panels',
  },
]

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-5 w-5 rounded-full border border-slate-200 shadow-sm"
      style={{ backgroundColor: color }}
    />
  )
}

export function Configuration() {
  const [apiUrl, setApiUrl] = useState(CONFIG.apiUrl)
  const [refreshInterval, setRefresh] = useState(CONFIG.refreshInterval / 1000)
  const [currency, setCurrency] = useState(CONFIG.currency)
  const [saved, setSaved] = useState(false)

  const { colors, setColors, resetColors } = useTheme()
  const [draft, setDraft] = useState<ThemeColors>(colors)

  // Branding — sync when context finishes loading from API
  const { companyName, logo, googleReviewUrl, googlePlaceId, settings, save: saveBrand } = useBrand()
  const [brandName, setBrandName] = useState(companyName)
  const [logoPreview, setLogoPreview] = useState<string | null>(logo)
  const [reviewUrl, setReviewUrl] = useState<string>(googleReviewUrl ?? '')
  const [placeId, setPlaceId] = useState<string>(googlePlaceId ?? '')

  const [brandSaved, setBrandSaved] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Integrations — Twilio Voice + Firebase FCM
  const [voiceFrom, setVoiceFrom] = useState(settings.voiceFrom ?? '')
  const [voiceTwimlAppSid, setVoiceTwimlAppSid] = useState(settings.voiceTwimlAppSid ?? '')
  const [voiceApiKeySid, setVoiceApiKeySid] = useState(settings.voiceApiKeySid ?? '')
  const [voiceApiKeySecret, setVoiceApiKeySecret] = useState(settings.voiceApiKeySecret ?? '')
  const [voiceForwardTo, setVoiceForwardTo] = useState(settings.voiceForwardTo ?? '')
  const [firebaseJson, setFirebaseJson] = useState(settings.firebaseCredentialsJson ?? '')
  const [twilioSaved, setTwilioSaved] = useState(false)
  const [twilioSaving, setTwilioSaving] = useState(false)
  const [fbSaved, setFbSaved] = useState(false)
  const [fbSaving, setFbSaving] = useState(false)

  // Message routing — TEST mode (reroute all WhatsApp + SMS to a test phone)
  const [testMode, setTestMode] = useState<boolean>(settings.testMode ?? false)
  const [testPhone, setTestPhone] = useState(settings.testRedirectPhone ?? '')
  const [routingSaved, setRoutingSaved] = useState(false)
  const [routingSaving, setRoutingSaving] = useState(false)

  // Quote approvers — which users get the approval link on WhatsApp
  const [users, setUsers] = useState<Usuario[]>([])
  const [approverIds, setApproverIds] = useState<string[]>(
    (settings.approvalUserIds ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  )
  const [approversSaved, setApproversSaved] = useState(false)
  const [approversSaving, setApproversSaving] = useState(false)

  // Feature flags — show/hide modules + in-page features for the whole team.
  const [flags, setFlags] = useState<FeatureFlags>(() => parseFeatureFlags(settings.featureFlags))
  const [flagsSaved, setFlagsSaved] = useState(false)
  const [flagsSaving, setFlagsSaving] = useState(false)

  useEffect(() => {
    userService.getAll().then(setUsers).catch(() => {})
  }, [])

  useEffect(() => {
    setBrandName(companyName)
    setLogoPreview(logo)
    setReviewUrl(googleReviewUrl ?? '')
    setPlaceId(googlePlaceId ?? '')
    setVoiceFrom(settings.voiceFrom ?? '')
    setVoiceTwimlAppSid(settings.voiceTwimlAppSid ?? '')
    setVoiceApiKeySid(settings.voiceApiKeySid ?? '')
    setVoiceApiKeySecret(settings.voiceApiKeySecret ?? '')
    setVoiceForwardTo(settings.voiceForwardTo ?? '')
    setFirebaseJson(settings.firebaseCredentialsJson ?? '')
    setTestMode(settings.testMode ?? false)
    setTestPhone(settings.testRedirectPhone ?? '')
    setApproverIds((settings.approvalUserIds ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    setFlags(parseFeatureFlags(settings.featureFlags))
    // Hydrate theme colors from the backend (source of truth shared with mobile).
    if (settings.themePrimary || settings.themeSecondary || settings.themeTertiary) {
      const fromApi = {
        primary: settings.themePrimary ?? colors.primary,
        secondary: settings.themeSecondary ?? colors.secondary,
        tertiary: settings.themeTertiary ?? colors.tertiary,
      }
      setColors(fromApi)
      setDraft(fromApi)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, logo, googleReviewUrl, googlePlaceId, settings])

  const handleLogoFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => setLogoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleLogoFile(file)
  }

  const handleSaveBrand = async () => {
    setBrandSaving(true)
    try {
      await saveBrand({
        companyName: brandName,
        logoBase64: logoPreview,
        googleReviewUrl: reviewUrl.trim() === '' ? null : reviewUrl.trim(),
        googlePlaceId: placeId.trim() === '' ? null : placeId.trim(),
      })
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setBrandSaving(false)
    }
  }

  const trimOrNull = (v: string) => (v.trim() === '' ? null : v.trim())

  const handleSaveTwilio = async () => {
    setTwilioSaving(true)
    try {
      await saveBrand({
        voiceFrom: trimOrNull(voiceFrom),
        voiceTwimlAppSid: trimOrNull(voiceTwimlAppSid),
        voiceApiKeySid: trimOrNull(voiceApiKeySid),
        voiceApiKeySecret: trimOrNull(voiceApiKeySecret),
        voiceForwardTo: trimOrNull(voiceForwardTo),
      })
      setTwilioSaved(true)
      setTimeout(() => setTwilioSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setTwilioSaving(false)
    }
  }

  const handleSaveRouting = async () => {
    setRoutingSaving(true)
    try {
      await saveBrand({ testMode, testRedirectPhone: trimOrNull(testPhone) })
      setRoutingSaved(true)
      setTimeout(() => setRoutingSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setRoutingSaving(false)
    }
  }

  const toggleApprover = (id: string) =>
    setApproverIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const handleSaveApprovers = async () => {
    setApproversSaving(true)
    try {
      await saveBrand({ approvalUserIds: approverIds.length ? approverIds.join(',') : null })
      setApproversSaved(true)
      setTimeout(() => setApproversSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setApproversSaving(false)
    }
  }

  const toggleFlag = (key: FeatureKey) => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleSaveFlags = async () => {
    setFlagsSaving(true)
    try {
      await saveBrand({ featureFlags: serializeFeatureFlags(flags) })
      setFlagsSaved(true)
      setTimeout(() => setFlagsSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setFlagsSaving(false)
    }
  }

  const handleSaveFirebase = async () => {
    setFbSaving(true)
    try {
      await saveBrand({ firebaseCredentialsJson: trimOrNull(firebaseJson) })
      setFbSaved(true)
      setTimeout(() => setFbSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setFbSaving(false)
    }
  }

  const handleSave = () => {
    setColors(draft)
    // Persist to the backend too so the mobile app uses the same colors.
    saveBrand({
      themePrimary: draft.primary,
      themeSecondary: draft.secondary,
      themeTertiary: draft.tertiary,
    }).catch((err) => console.error(err))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass =
    'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white'

  return (
    <div className="space-y-6">
      {/* Company branding */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Company branding</CardTitle>
          <p className="text-sm text-slate-500">Company name and logo shown in the sidebar.</p>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Company name</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className={inputClass}
              placeholder="Your company name"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Logo</label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition hover:border-slate-400 hover:bg-slate-100 cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Logo preview" className="h-20 max-w-[200px] object-contain rounded-xl" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setLogoPreview(null) }}
                    className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-xs text-slate-400">Click or drag to replace</p>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Click or drag to upload</p>
                    <p className="text-xs text-slate-400">PNG, JPG, SVG or WebP — max 2 MB</p>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f) }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Google review link</label>
            <input
              type="url"
              value={reviewUrl}
              onChange={(e) => setReviewUrl(e.target.value)}
              className={inputClass}
              placeholder="https://g.page/r/…/review"
            />
            <p className="text-xs text-slate-400">
              When set, clients are texted this link on WhatsApp once they fully pay a quote. Leave empty to disable.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Google Place ID</label>
            <input
              type="text"
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              className={inputClass}
              placeholder="ChIJ…"
            />
            <p className="text-xs text-slate-400">
              Used to show your Google rating and latest reviews on the Reviews page. Find it at{' '}
              <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noreferrer" className="underline">
                Google's Place ID finder
              </a>. Leave empty to disable.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveBrand}
              disabled={brandSaving}
            >
              {brandSaving ? 'Saving…' : 'Save branding'}
            </Button>
            {brandSaved && <span className="text-sm font-medium text-emerald-600">Saved — sidebar updated</span>}
          </div>
        </CardContent>
      </Card>

      {/* Features & modules — runtime feature flags */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Features &amp; modules</CardTitle>
          <p className="text-sm text-slate-500">
            Show or hide sections of the app and individual features. Changes apply to the whole team after saving.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {(['modules', 'features'] as const).map((group) => {
            const items = FEATURE_CATALOG.filter((f) => f.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  {group === 'modules' ? 'Menu modules' : 'In-page features'}
                </p>
                <div className="space-y-2">
                  {items.map((f) => (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{f.label}</span>
                        <span className="block text-xs text-slate-400">{f.description}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={flags[f.key]}
                        onChange={() => toggleFlag(f.key)}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveFlags}
              disabled={flagsSaving}
            >
              {flagsSaving ? 'Saving…' : 'Save features'}
            </Button>
            {flagsSaved && <span className="text-sm font-medium text-emerald-600">Saved — applies after reload</span>}
          </div>
        </CardContent>
      </Card>

      {/* Twilio — in-app calls */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Twilio · Calls</CardTitle>
          <p className="text-sm text-slate-500">Powers in-app phone calls with the shop's number as caller ID.</p>
        </CardHeader>
        <CardContent className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Shop phone number (caller ID)</label>
            <input
              type="text"
              value={voiceFrom}
              onChange={(e) => setVoiceFrom(e.target.value)}
              className={inputClass}
              placeholder="+1 213 460 5897"
            />
            <p className="text-xs text-slate-400">The voice-capable Twilio number customers see when the app calls them.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Forward incoming calls to</label>
            <input
              type="text"
              value={voiceForwardTo}
              onChange={(e) => setVoiceForwardTo(e.target.value)}
              className={inputClass}
              placeholder="+1 213 000 0000"
            />
            <p className="text-xs text-slate-400">
              Optional. When set, inbound calls ring this real phone. Leave blank to ring the app (simone-mobile) instead. Either way the call is logged in the chat.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">TwiML App SID</label>
            <input
              type="text"
              value={voiceTwimlAppSid}
              onChange={(e) => setVoiceTwimlAppSid(e.target.value)}
              className={inputClass}
              placeholder="AP…"
            />
            <p className="text-xs text-slate-400">
              Twilio Console → Voice → TwiML Apps. Its Voice Request URL must be{' '}
              <code className="rounded bg-slate-100 px-1">/api/public/webhooks/twilio/voice</code>.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">API Key SID</label>
              <input
                type="text"
                value={voiceApiKeySid}
                onChange={(e) => setVoiceApiKeySid(e.target.value)}
                className={inputClass}
                placeholder="SK…"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">API Key Secret</label>
              <input
                type="password"
                value={voiceApiKeySecret}
                onChange={(e) => setVoiceApiKeySecret(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveTwilio}
              disabled={twilioSaving}
            >
              {twilioSaving ? 'Saving…' : 'Save Twilio'}
            </Button>
            {twilioSaved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Message routing · TEST mode */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Message routing · TEST mode</CardTitle>
          <p className="text-sm text-slate-500">
            While ON, every outbound WhatsApp <strong>and</strong> SMS goes to your test phone instead of the real client. Turn OFF to send to real clients.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 px-6 py-6">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-slate-900">Test mode</span>
              <span className="block text-xs text-slate-400">Reroute all outbound WhatsApp + SMS to the test phone below.</span>
            </span>
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="h-5 w-5 cursor-pointer rounded border-slate-300"
            />
          </label>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Test phone</label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className={inputClass}
              placeholder="+34664577327"
            />
            <p className="text-xs text-slate-400">
              Receives all messages while test mode is on.{' '}
              {testMode && testPhone.trim() === '' && (
                <span className="font-semibold text-rose-500">Set a phone, or messages will still go to real clients.</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveRouting}
              disabled={routingSaving}
            >
              {routingSaving ? 'Saving…' : 'Save routing'}
            </Button>
            {routingSaved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Quote approvers */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Quote approvers</CardTitle>
          <p className="text-sm text-slate-500">
            Users who receive a pending quote's approval link on WhatsApp. Pick one or more.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            {users.length === 0 && <p className="text-sm text-slate-400">No users found.</p>}
            {users.map((u) => {
              const noPhone = !u.phone || u.phone.trim() === ''
              return (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={approverIds.includes(u.id)}
                    onChange={() => toggleApprover(u.id)}
                    className="h-5 w-5 cursor-pointer rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{u.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {u.email}{noPhone ? ' · no WhatsApp phone' : ` · ${u.phone}`}
                    </span>
                  </span>
                  {noPhone && <span className="shrink-0 text-[10px] font-semibold text-rose-500">no phone</span>}
                </label>
              )
            })}
            <p className="text-xs text-slate-400">
              A selected user only gets the link if they have a WhatsApp phone in their Profile.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveApprovers}
              disabled={approversSaving}
            >
              {approversSaving ? 'Saving…' : 'Save approvers'}
            </Button>
            {approversSaved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Firebase — push notifications */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Firebase · Push</CardTitle>
          <p className="text-sm text-slate-500">Sends push notifications to the mobile app.</p>
        </CardHeader>
        <CardContent className="space-y-5 px-6 py-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-900">Service account JSON</label>
            <textarea
              value={firebaseJson}
              onChange={(e) => setFirebaseJson(e.target.value)}
              className={`${inputClass} h-40 font-mono text-xs`}
              placeholder='{ "type": "service_account", "project_id": "…", … }'
            />
            <p className="text-xs text-slate-400">
              Firebase Console → Project settings → Service accounts → Generate new private key. Paste the whole JSON.
              Leave empty to disable push.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSaveFirebase}
              disabled={fbSaving}
            >
              {fbSaving ? 'Saving…' : 'Save Firebase'}
            </Button>
            {fbSaved && <span className="text-sm font-medium text-emerald-600">Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Theme colors */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Theme colors</CardTitle>
          <p className="text-sm text-slate-500">
            Customize the workspace palette. Changes apply immediately across the whole interface.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {COLOR_ROLES.map(({ key, label, description }) => (
              <div key={key} className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-400">{description}</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <input
                    type="color"
                    value={draft[key]}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
                  />
                  <span className="font-mono text-sm text-slate-700">{draft[key].toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div className="rounded-2xl border border-slate-100 p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Preview</p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: draft.primary }}>
                <span className="text-xs font-bold text-white">P</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: draft.secondary }}>
                <span className="text-xs font-bold" style={{ color: draft.primary }}>S</span>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: draft.tertiary }}>
                <span className="text-xs font-bold" style={{ color: draft.primary }}>T</span>
              </div>
              <div className="h-10 flex-1 rounded-xl" style={{ background: `linear-gradient(135deg, ${draft.primary}, ${draft.secondary})` }} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              className="rounded-2xl px-5 text-white"
              style={{ backgroundColor: draft.primary }}
              onClick={handleSave}
            >
              Save theme
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-2xl px-5"
              onClick={() => { resetColors(); setDraft({ primary: '#3C2E60', secondary: '#DBCEE2', tertiary: '#EDEAF9' }) }}
            >
              Reset to defaults
            </Button>
            {saved && <span className="text-sm font-medium text-emerald-600">Theme applied</span>}
          </div>
        </CardContent>
      </Card>

      {/* Save platform settings */}
      <div className="flex items-center gap-3">
        <Button size="lg" className="rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-800" onClick={handleSave}>
          Save changes
        </Button>
        {saved && <span className="text-sm font-medium text-emerald-600">Saved successfully</span>}
      </div>
    </div>
  )
}
