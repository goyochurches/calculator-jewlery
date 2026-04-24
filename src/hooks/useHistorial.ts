import { useEffect, useState } from 'react'
import { metalsService } from '../services/metalService'
import type { HistorialEntry } from '../types'

const POLL_INTERVAL = 120_000

export function useHistory() {
  const [historyEntries, setHistoryEntries] = useState<HistorialEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await metalsService.getHistory()
        setHistoryEntries(data)
        setError(null)
      } catch {
        setError('Unable to load price history')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
    const interval = setInterval(fetchHistory, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  return { historyEntries, loading, error }
}
