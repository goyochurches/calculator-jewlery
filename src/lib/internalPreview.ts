import { useAuth } from '@/context/AuthContext'

/**
 * Gate for in-progress features that shouldn't reach every user/company yet
 * (e.g. still being validated against The Edge for Jewelers' feature set).
 * This only hides UI — it's not a security boundary, so don't rely on it to
 * protect data; the underlying API endpoints stay reachable regardless.
 *
 * Add/remove addresses here as the preview group changes. Once a feature is
 * ready for everyone, delete its `useInternalPreview()` checks instead of
 * adding more emails.
 */
const INTERNAL_PREVIEW_EMAILS = new Set([
  'fcalderong20@gmail.com',
])

export function useInternalPreview(): boolean {
  const { user } = useAuth()
  const email = user?.email?.toLowerCase().trim()
  return !!email && INTERNAL_PREVIEW_EMAILS.has(email)
}
