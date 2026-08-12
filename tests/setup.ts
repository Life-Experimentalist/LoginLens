import { beforeEach, vi } from 'vitest'
import { installChromeMock, resetChromeMock } from './helpers/chrome-mock'

// Every module under src/core reaches for chrome.* at import time, so the mock
// has to exist before any of them are loaded.
installChromeMock()

beforeEach(() => {
  resetChromeMock()
})

// Tests default to the `node` environment because it starts an order of
// magnitude faster; component tests opt into jsdom with a
// `// @vitest-environment jsdom` docblock. Only set up the DOM helpers when
// there is actually a DOM.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')

  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as any
  }
}
