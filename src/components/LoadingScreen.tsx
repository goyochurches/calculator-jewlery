import { useEffect, useState } from 'react'

const DEFAULT_LOGO_URL = '/s%26s_logo.png'

interface LoadingScreenProps {
  /** Primary status line. Defaults to a neutral "Loading…". */
  message?: string
  /** Show the brand logo + name above the spinner. On for full-page loads
   *  (initial session check); off when embedded in a smaller surface. */
  brand?: boolean
}

/**
 * Full-screen branded loader. Built primarily for the Render free-tier
 * cold-start wait: the backend can take 30–60s to spin back up, so after a few
 * seconds we surface a reassuring "waking the server up" hint instead of
 * leaving the user staring at a silent spinner wondering if it's stuck.
 */
export function LoadingScreen({ message = 'Loading…', brand = true }: LoadingScreenProps) {
  const [showColdStartHint, setShowColdStartHint] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowColdStartHint(true), 6000)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--theme-tertiary)' }}
    >
      <div className="flex flex-col items-center text-center">
        {brand && (
          <img
            src={DEFAULT_LOGO_URL}
            alt="Simone & Son"
            width={72}
            height={72}
            className="mb-5 object-contain animate-pulse"
          />
        )}

        {/* Spinner ring: light track + brand-coloured leading edge */}
        <span
          className="h-10 w-10 rounded-full border-4 border-slate-200 animate-spin"
          style={{ borderTopColor: 'var(--theme-primary)' }}
          aria-hidden="true"
        />

        <p className="mt-5 text-sm font-medium text-slate-700">{message}</p>

        {/* Cold-start reassurance — fades in only if the wait drags on. */}
        <p
          className={`mt-2 max-w-xs text-xs text-slate-400 transition-opacity duration-700 ${
            showColdStartHint ? 'opacity-100' : 'opacity-0'
          }`}
        >
          The server was idle and is waking up — this can take up to a minute on
          the first load. Hang tight…
        </p>

        <span className="sr-only" role="status">
          {message}
        </span>
      </div>
    </div>
  )
}
