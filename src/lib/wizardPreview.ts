/**
 * Personal, device-local preview switch for the Quote Wizard (Beta).
 *
 * Unlike the shared `quotes-wizard` runtime feature flag (which, once enabled in
 * Configuration, shows the wizard to EVERY user), this preview lives only in the
 * current browser's localStorage — so you can try the wizard yourself without
 * exposing it to the rest of the team.
 *
 * Turn it ON  by opening any page with  ?wizard=1   (or ?wizard=on)
 * Turn it OFF by opening any page with  ?wizard=0   (or ?wizard=off)
 * The choice sticks until you flip it again or clear site data.
 */
const KEY = 'ss-wizard-preview'

/** Read ?wizard= from the URL once at startup and persist the choice. Call this
 *  BEFORE React renders so the very first paint already reflects the flag. */
export function syncWizardPreviewFromUrl(): void {
  try {
    const v = new URLSearchParams(window.location.search).get('wizard')
    if (v === '1' || v === 'on') localStorage.setItem(KEY, '1')
    else if (v === '0' || v === 'off') localStorage.removeItem(KEY)
  } catch {
    // SSR / private-mode / disabled storage — preview simply stays off.
  }
}

/** True when this browser has opted into the wizard preview. */
export function isWizardPreview(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
