// Helpers for the public quote share link.

/** Build the absolute URL the client receives in an email/WhatsApp/etc. */
export function publicQuoteUrl(token: string): string {
  if (typeof window === 'undefined') return `/q/${token}`
  return `${window.location.origin}/q/${token}`
}

/** Copy a string to the clipboard with a robust fallback for older browsers. */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Fallback for older browsers / non-secure contexts
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try { document.execCommand('copy') }
  finally { document.body.removeChild(textarea) }
}
