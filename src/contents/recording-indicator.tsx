// ---------------------------------------------------------------------------
// On-page indicator for manual OAuth recording.
// ---------------------------------------------------------------------------
// While "Record OAuth Login" is on, universal-scraper.ts reads identities out
// of every page the user visits. That is exactly what they asked for, but a
// credential tool reading pages with no visible sign is the kind of thing users
// are right to distrust — and the only way to turn it off used to be reopening
// the popup and remembering which button had been pressed.
//
// So: while manual recording is on, every top-level page carries a small pill
// saying so, with the stop switch attached to it.
//
// Deliberately NOT shown for "Always auto-detect OAuth". That one is a standing
// preference the user set in Settings and can see there; a banner on every page
// forever would just be noise, and noise is what teaches people to ignore
// indicators that matter.
// ---------------------------------------------------------------------------

import React from 'react'
import type { PlasmoCSConfig, PlasmoGetStyle } from 'plasmo'
import { useStorage } from '@plasmohq/storage/hook'
import { extensionStorage } from '../core/storage/config'
import cssText from 'data-text:~/style.css'

export const config: PlasmoCSConfig = {
  matches: ['http://*/*', 'https://*/*'],
  // Top frame only. An OAuth consent screen embedded in an iframe would
  // otherwise stack a second pill on top of the first.
  all_frames: false
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement('style')
  style.textContent = cssText
  return style
}

// Closed rather than Plasmo's default open mode, so a page cannot read this
// pill out of `host.shadowRoot` and learn that recording is running.
export const createShadowRoot = (host: HTMLElement) =>
  host.attachShadow({ mode: 'closed' })

const RecordingIndicator = () => {
  const [isRecording, setIsRecording] = useStorage<boolean>(
    { key: 'is_recording_oauth', instance: extensionStorage },
    false
  )

  if (!isRecording) return null

  return (
    <div
      role="status"
      aria-live="polite"
      // Fixed and centred at the top, above everything. `pointer-events-none`
      // on the wrapper so the pill never swallows clicks meant for the page —
      // only the pill itself takes them back.
      className="fixed top-3 left-0 right-0 z-[2147483647] flex justify-center pointer-events-none font-sans"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-zinc-900/95 px-4 py-2 text-sm text-zinc-100 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500"
        />
        <span>
          <strong className="font-semibold">LoginLens</strong> is recording this
          sign-in
        </span>
        <button
          type="button"
          onClick={() => setIsRecording(false)}
          className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Stop
        </button>
      </div>
    </div>
  )
}

export default RecordingIndicator
