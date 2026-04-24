import { useEffect, useState } from 'react'
import { metalsService } from '../services/metalService'
import type { MetalPrice } from '../types'

const POLL_INTERVAL = 120_000

export function useMetals() {
  const [metals, setMetals] = useState<MetalPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const fetchMetals = async () => {
      try {
        const data = await metalsService.getPrices()
        setMetals(data)
        setLastUpdated(new Date())
        setError(null)
      } catch {
        setError('Unable to load metal prices')
      } finally {
        setLoading(false)
      }
    }

    fetchMetals()
    const interval = setInterval(fetchMetals, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  return { metals, loading, error, lastUpdated }
}
