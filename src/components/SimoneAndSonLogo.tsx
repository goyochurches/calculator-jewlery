// Reusable Simone & Son brand mark. Used on the login screen and as the
// header brand on the public quote share link. Renders an elegant inline
// SVG so we don't depend on bundled image assets — replace the inner SVG
// when a finalized logo file is available.

interface Props {
  /** Square size in px for the mark. */
  size?: number
  /** Optional className applied to the outer wrapper. */
  className?: string
  /** When true, the wordmark ("Simone & Son") sits next to the mark.
   *  When false, just the diamond medallion is rendered. */
  withWordmark?: boolean
  /** "dark" → dark background, light fill (for hero sections / share link).
   *  "light" → light background, dark fill (for login / app surfaces).
   *  Defaults to "light". */
  tone?: 'light' | 'dark'
}

export function SimoneAndSonLogo({
  size = 64,
  className = '',
  withWordmark = false,
  tone = 'light',
}: Props) {
  const isDark = tone === 'dark'
  const fillBg     = isDark ? 'rgba(255,255,255,0.08)' : '#0f172a'
  const strokeMain = isDark ? '#fde68a' : '#facc15'
  const strokeSoft = isDark ? 'rgba(253,224,71,0.45)' : 'rgba(15,23,42,0.45)'
  const textColor  = isDark ? '#fde68a' : '#facc15'

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Simone & Son"
      >
        <defs>
          <linearGradient id="ss-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor="#fde68a" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
        </defs>

        {/* Diamond medallion */}
        <path
          d="M32 4 L60 22 V42 L32 60 L4 42 V22 Z"
          fill={fillBg}
          stroke="url(#ss-gold)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Facet lines */}
        <path
          d="M32 4 L32 60 M4 22 L60 42 M60 22 L4 42 M32 4 L60 42 M32 4 L4 42 M32 60 L4 22 M32 60 L60 22"
          stroke={strokeSoft}
          strokeWidth="0.6"
        />
        {/* Monogram "S&S" */}
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', 'Playfair Display', Georgia, serif"
          fontWeight="600"
          fontSize="18"
          fill={textColor}
          letterSpacing="0.5"
        >
          S&amp;S
        </text>
        <path
          d="M22 46 H42"
          stroke={strokeMain}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      </svg>

      {withWordmark && (
        <div className="leading-tight">
          <p
            className="font-serif text-lg font-semibold tracking-wide"
            style={{ color: isDark ? '#fef3c7' : '#0f172a' }}
          >
            Simone &amp; Son
          </p>
          <p
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: isDark ? 'rgba(253,224,71,0.85)' : 'rgba(15,23,42,0.55)' }}
          >
            Fine Jewelry
          </p>
        </div>
      )}
    </div>
  )
}

export default SimoneAndSonLogo
