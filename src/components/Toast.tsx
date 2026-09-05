import { Check, X } from 'lucide-react'
import { useEffect } from 'react'

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDismiss, 3200)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss])

  if (!message) return null
  return (
    <div className="toast" role="status">
      <Check size={18} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Закрыть уведомление">
        <X size={18} />
      </button>
    </div>
  )
}
