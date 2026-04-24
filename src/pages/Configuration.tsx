import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CONFIG } from '@/constants/config'
import { useBrand } from '@/context/BrandContext'
import { useTheme, type ThemeColors } from '@/context/ThemeContext'
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
  const { companyName, logo, save: saveBrand } = useBrand()
  const [brandName, setBrandName] = useState(companyName)
  const [logoPreview, setLogoPreview] = useState<string | null>(logo)

  const [brandSaved, setBrandSaved] = useState(false)
  const [brandSaving, setBrandSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setBrandName(companyName)
    setLogoPreview(logo)
  }, [companyName, logo])

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
      await saveBrand(brandName, logoPreview)
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2500)
    } catch (err) {
      console.error(err)
    } finally {
      setBrandSaving(false)
    }
  }

  const handleSave = () => {
    setColors(draft)
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
