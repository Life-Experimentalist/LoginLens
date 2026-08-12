import { nativeStorage } from '../storage/native'

export interface LogEntry {
  timestamp: number
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  message: string
  data?: any
}

const MAX_LOGS = 500

// Log calls arrive in bursts — a single OAuth capture emits a handful in a few
// milliseconds. Writing each one individually meant reading the entire stored
// array, pushing one entry, and writing all of it back, per call: a thousand
// times the necessary I/O at the worst possible moment, since chrome.storage
// writes are what the rest of the extension is waiting on. Entries are batched
// in memory and flushed once the burst settles.
const FLUSH_DELAY_MS = 800

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Keys whose values are the user's own data rather than diagnostic context.
// The console still receives the real object — only what is written to disk is
// redacted, because app_logs outlives the session and gets pasted into bug
// reports.
const SENSITIVE_KEY_RE =
  /pass|secret|token|api[_-]?key|credential|identit|username|email/i

const MAX_STRING_LEN = 200
const MAX_DEPTH = 4

function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (depth > MAX_DEPTH) return '<…>'

  if (typeof value === 'string') {
    const masked = value.replace(EMAIL_RE, '<email>')
    return masked.length > MAX_STRING_LEN
      ? `${masked.slice(0, MAX_STRING_LEN)}…`
      : masked
  }

  if (typeof value !== 'object') return value

  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) }
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1))
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '<redacted>' : redact(val, depth + 1)
  }
  return out
}

class Logger {
  private buffer: LogEntry[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> | null = null
  private tail: Promise<void> = Promise.resolve()

  private async isDebugEnabled(): Promise<boolean> {
    try {
      const stored = await nativeStorage.get<boolean>('debug_mode')
      if (typeof stored === 'boolean') return stored
    } catch {
      // Storage unavailable (e.g. a torn-down context) — fall through to the
      // build-time default rather than losing the console line entirely.
    }
    return process.env.NODE_ENV === 'development'
  }

  private addLog(level: LogEntry['level'], message: string, data?: any) {
    // The timestamp is taken here, at the call, rather than wherever the entry
    // eventually gets appended.
    const timestamp = Date.now()

    // Appends are serialized through a promise chain so entries land in the
    // order they were logged. Warnings and errors skip the debug-mode lookup
    // below, so without this they overtake INFO entries that are still waiting
    // on storage — and a log where the warning appears before the line that
    // preceded it points at the wrong cause.
    this.tail = this.tail.then(() =>
      this.append(level, timestamp, message, data)
    )
  }

  private async append(
    level: LogEntry['level'],
    timestamp: number,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      // Warnings and errors are always kept: they are what a user needs to be
      // able to hand over when something goes wrong, and asking them to first
      // enable Debug Mode and then reproduce the failure is not a support
      // story. INFO and DEBUG are diagnostic volume, kept only on request.
      const alwaysKeep = level === 'WARN' || level === 'ERROR'
      const debugEnabled = alwaysKeep ? true : await this.isDebugEnabled()

      if (level === 'DEBUG' && !debugEnabled) return

      const consoleMethod = level === 'DEBUG' ? 'log' : level.toLowerCase()
      if (data !== undefined) {
        ;(console as any)[consoleMethod](`[${level}] ${message}`, data)
      } else {
        ;(console as any)[consoleMethod](`[${level}] ${message}`)
      }

      if (!alwaysKeep && !debugEnabled) return

      this.buffer.push({
        timestamp,
        level,
        message,
        data: data === undefined ? undefined : redact(data)
      })

      this.scheduleFlush()
    } catch (e) {
      // Never let a logging failure escape: the chain has to stay alive, and a
      // rejected tail with no later call to absorb it is an unhandled rejection.
      console.error('[LoginLens] Logging failed', e)
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, FLUSH_DELAY_MS)
  }

  /**
   * Writes any buffered entries to storage. Safe to call at any time; the UI
   * calls it before reading so the Logs panel is never a step behind.
   */
  async flush(): Promise<void> {
    // Entries still working their way through the append chain have not
    // reached the buffer yet. Draining without waiting for them would report
    // success while leaving the most recent lines unwritten.
    await this.tail

    if (this.flushing) return this.flushing

    this.flushing = (async () => {
      while (this.buffer.length > 0) {
        // Claim the batch before awaiting, so entries logged during the write
        // land in the next batch rather than being dropped by the reassignment.
        const batch = this.buffer
        this.buffer = []
        try {
          const raw = await nativeStorage.get<LogEntry[]>('app_logs')
          const logs = Array.isArray(raw) ? raw : []
          logs.push(...batch)
          if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS)
          await nativeStorage.set('app_logs', logs)
        } catch (e) {
          // Never recurse into the logger here — a failing storage write would
          // log an error, which would schedule another failing write.
          console.error('Failed to write to log storage', e)
          return
        }
      }
    })()

    try {
      await this.flushing
    } finally {
      this.flushing = null
    }
  }

  info(message: string, data?: any) {
    this.addLog('INFO', message, data)
  }
  warn(message: string, data?: any) {
    this.addLog('WARN', message, data)
  }
  error(message: string, data?: any) {
    this.addLog('ERROR', message, data)
  }
  debug(message: string, data?: any) {
    this.addLog('DEBUG', message, data)
  }

  async getLogs(): Promise<LogEntry[]> {
    await this.flush()
    const raw = await nativeStorage.get<LogEntry[]>('app_logs')
    return Array.isArray(raw) ? raw : []
  }

  async clearLogs() {
    // Let in-flight appends land first, or they arrive after the wipe and the
    // "cleared" log immediately has entries in it again.
    await this.tail
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.buffer = []
    await nativeStorage.set('app_logs', [])
  }
}

export const log = new Logger()
