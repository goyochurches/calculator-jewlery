import { useMemo } from 'react'
import { useBrand } from '@/context/BrandContext'
import { parseFeatureFlags, type FeatureFlags, type FeatureKey } from '@/lib/featureFlags'

/**
 * Reads the runtime feature flags from the (backend-backed) company settings
 * and exposes a simple `isEnabled` check. Anything missing defaults to ON, so
 * a fresh install or a public page with no settings shows everything.
 *
 * Note: the flags live behind the authenticated `/api/settings` call, so on
 * unauthenticated pages (e.g. the public quote viewer) settings stay at their
 * defaults and every feature reads as enabled.
 */
export function useFeatures(): { flags: FeatureFlags; isEnabled: (key: FeatureKey) => boolean } {
  const { settings } = useBrand()
  const flags = useMemo(() => parseFeatureFlags(settings.featureFlags), [settings.featureFlags])
  return {
    flags,
    isEnabled: (key: FeatureKey) => flags[key] !== false,
  }
}
