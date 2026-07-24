import { driver, type Config, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

export type TourStep = DriveStep

/** Builds a driver.js instance styled to match the app (rounded cards,
 *  theme-aware buttons via the .sj-tour-popover CSS in index.css). */
export function createTour(steps: TourStep[], overrides: Partial<Config> = {}) {
  return driver({
    showProgress: steps.length > 1,
    animate: true,
    smoothScroll: true,
    allowClose: true,
    overlayColor: '#0f172a',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 16,
    popoverClass: 'sj-tour-popover',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    progressText: '{{current}} / {{total}}',
    steps,
    ...overrides,
  })
}
