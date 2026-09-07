import { flushSync } from 'react-dom'

/**
 * Safely triggers a document View Transition if supported by the browser/WebView
 * and if the user does not have prefers-reduced-motion active.
 * Uses flushSync to ensure React synchronously updates the DOM before the new snapshot is taken.
 * Gracefully falls back to direct callback execution if unsupported or if an error occurs.
 */
export function safeStartViewTransition(
  updateCallback: () => void
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    updateCallback()
    return
  }

  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const doc = document as unknown as {
    startViewTransition?: (cb: () => void | Promise<void>) => unknown
  }

  if (typeof doc.startViewTransition === 'function' && !prefersReduced) {
    try {
      doc.startViewTransition(() => {
        try {
          flushSync(() => {
            updateCallback()
          })
        } catch {
          // If already in a flushSync context or render phase, fallback directly
          updateCallback()
        }
      })
    } catch {
      updateCallback()
    }
  } else {
    updateCallback()
  }
}
