// @vitest-environment jsdom
import React from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from '~/components/ui/ToastContext'

// Testing Library only auto-cleans when vitest runs with `globals: true`, and
// this suite does not. Without it every render stays in the document and
// getByText starts finding the previous test's copy.
//
// Deliberately not vi.restoreAllMocks() here: the shared setup installs
// window.matchMedia as a vi.fn(), and restoring it strips the implementation
// out from under framer-motion.
afterEach(cleanup)

function Harness({ onConfirm }: { onConfirm?: () => void }) {
  const { showToast, confirmAction } = useToast()
  return (
    <>
      <button onClick={() => showToast('Saved 12 accounts')}>toast</button>
      <button onClick={() => showToast('Import failed', 'error')}>fail</button>
      <button
        onClick={() =>
          confirmAction({
            title: 'Delete 12 accounts?',
            message: 'This cannot be undone.',
            type: 'destructive',
            onConfirm: onConfirm ?? (() => {})
          })
        }
      >
        destroy
      </button>
    </>
  )
}

const renderWithProvider = (props: { onConfirm?: () => void } = {}) =>
  render(
    <ToastProvider>
      <Harness {...props} />
    </ToastProvider>
  )

describe('useToast without a provider', () => {
  it('throws instead of quietly logging to a console nobody reads', () => {
    // The regression this pins: ToastProvider was never mounted, so all 33
    // showToast calls in the app fell through to console.log. The UI looked
    // like it worked — every "Saved", "Deleted" and "Import failed" simply
    // never appeared.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    expect(() => render(<Harness />)).toThrow(/ToastProvider/)
    consoleError.mockRestore()
  })
})

describe('toasts', () => {
  it('shows the message it was given', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('toast'))
    expect(screen.getByText('Saved 12 accounts')).toBeTruthy()
  })

  it('shows errors too, not just successes', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('fail'))
    expect(screen.getByText('Import failed')).toBeTruthy()
  })

  it('can be dismissed before it expires', async () => {
    const { container } = renderWithProvider()
    fireEvent.click(screen.getByText('toast'))
    // The dismiss control is the only button inside the toast itself.
    const dismiss = container.querySelector<HTMLButtonElement>(
      '.pointer-events-auto button'
    )!
    fireEvent.click(dismiss)
    // AnimatePresence keeps the node mounted for its exit animation, so the
    // removal is asynchronous even though the click is not.
    await waitFor(() =>
      expect(screen.queryByText('Saved 12 accounts')).toBeNull()
    )
  })
})

describe('the confirm dialog', () => {
  it('asks before running a destructive action', () => {
    const onConfirm = vi.fn()
    renderWithProvider({ onConfirm })
    fireEvent.click(screen.getByText('destroy'))

    expect(screen.getByText('Delete 12 accounts?')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('runs the action on Confirm', () => {
    const onConfirm = vi.fn()
    renderWithProvider({ onConfirm })
    fireEvent.click(screen.getByText('destroy'))
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not run the action on Cancel', () => {
    const onConfirm = vi.fn()
    renderWithProvider({ onConfirm })
    fireEvent.click(screen.getByText('destroy'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('treats Escape as cancel, never as confirm', () => {
    // Worth pinning explicitly: this dialog mostly guards deletions, so a key
    // that dismissed it by *accepting* would be a data-loss bug.
    const onConfirm = vi.fn()
    renderWithProvider({ onConfirm })
    fireEvent.click(screen.getByText('destroy'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
