import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { priceListService, type PriceListItem } from '@/services/priceListService'
import { CheckCircle2, FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'uploading' | 'imported' | 'error'

export function PriceListPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<PriceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fileName, setFileName] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)

  const load = () => {
    setLoading(true)
    priceListService.getAll()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)
    setStatus('uploading')
    try {
      const saved = await priceListService.importFile(file)
      setImportedCount(saved.length)
      setStatus('imported')
      load()
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to import file.')
      setStatus('error')
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Import price list</CardTitle>
          <p className="text-sm text-slate-500">
            Upload an Excel (.xlsx) file. The first column should be the MM range (e.g.&nbsp;0.70-0.74) and the second the price. The backend parses it and replaces the current list.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <input
            ref={fileInputRef}
            id="price-list-file"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFileSelected}
            className="hidden"
            disabled={status === 'uploading'}
          />

          <label
            htmlFor="price-list-file"
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center transition hover:border-slate-400 hover:bg-white ${status === 'uploading' ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">
              {status === 'uploading' ? 'Uploading…' : 'Click to upload Excel file'}
            </span>
            <span className="text-xs text-slate-400">.xlsx, .xls (max 10MB)</span>
          </label>

          {fileName && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{fileName}</span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {status === 'imported' && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Imported {importedCount} rows successfully.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Current price list</CardTitle>
          <p className="text-sm text-slate-500">{loading ? '—' : `${items.length} rows in the master table.`}</p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-400">
              <Trash2 className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              No price list imported yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">MM Range</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Price</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Notes</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-6 py-2.5 font-medium text-slate-800">{p.mmRange}</td>
                      <td className="px-6 py-2.5 text-right text-slate-900">
                        {p.price !== null ? `$${Number(p.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-2.5 text-slate-500">{p.notes ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-6 py-2.5 text-slate-400 text-xs">{p.source ?? <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PriceListPage
