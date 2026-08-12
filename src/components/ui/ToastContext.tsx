import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X, HelpCircle } from 'lucide-react'

interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'destructive' | 'primary'
  onConfirm: () => void
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  confirmAction: (options: ConfirmOptions) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmModal, setConfirmModal] = useState<ConfirmOptions | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const confirmAction = useCallback((options: ConfirmOptions) => {
    setConfirmModal(options)
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Escape cancels. Deliberately only Escape and not Enter: this dialog is
  // mostly used to gate deletions, and a stray Enter confirming one is a
  // worse outcome than a stray Escape dismissing it.
  useEffect(() => {
    if (!confirmModal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmModal(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmModal])

  return (
    <ToastContext.Provider value={{ showToast, confirmAction }}>
      {children}

      {/* Toast Banners */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-3.5 rounded-xl border shadow-lg flex items-center gap-3 pointer-events-auto text-xs font-medium ${
                toast.type === 'error'
                  ? 'bg-destructive/15 border-destructive/30 text-destructive dark:text-red-400'
                  : toast.type === 'info'
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-500 dark:text-indigo-400'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {toast.type === 'error' ? (
                <AlertCircle size={16} className="shrink-0" />
              ) : toast.type === 'info' ? (
                <Info size={16} className="shrink-0" />
              ) : (
                <CheckCircle2 size={16} className="shrink-0" />
              )}
              <span className="flex-1">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-xl space-y-4"
            >
              <div className="flex items-center gap-3 text-foreground">
                <div
                  className={`p-2.5 rounded-xl border ${
                    confirmModal.type === 'destructive'
                      ? 'bg-destructive/10 border-destructive/20 text-destructive'
                      : 'bg-primary/10 border-primary/20 text-primary'
                  }`}
                >
                  <HelpCircle size={20} />
                </div>
                <h3 className="font-bold text-base">{confirmModal.title}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  {confirmModal.cancelText || 'Cancel'}
                </button>
                <button
                  onClick={() => {
                    confirmModal.onConfirm()
                    setConfirmModal(null)
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    confirmModal.type === 'destructive'
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}

/**
 * Throws when there is no provider above it, rather than degrading quietly.
 *
 * This used to fall back to `console.log` for toasts, which meant a missing
 * provider looked exactly like a working app: every confirmation and every
 * error message went to a console nobody has open. "Deleted 12 accounts" and
 * "Import failed" are not decoration — a user who does not see them cannot
 * tell a success from a silent failure. Failing loudly is the lesser harm, and
 * the ErrorBoundary above catches it.
 */
export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast was called outside a <ToastProvider>')
  }
  return ctx
}
