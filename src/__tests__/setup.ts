import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

if (!document.startViewTransition) {
  document.startViewTransition = (cb: () => void | Promise<void>) => {
    const res = cb()
    return {
      finished: Promise.resolve().then(() => res),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve().then(() => res),
      skipTransition: () => {},
    } as unknown as ViewTransition
  }
}
