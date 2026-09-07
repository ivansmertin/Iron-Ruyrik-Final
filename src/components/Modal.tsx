import { useEffect, useRef, type ReactNode } from 'react'
import { registerModal } from '../services/modalStack'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  titleId?: string
  className?: string
  children: ReactNode
}

export function Modal({
  isOpen,
  onClose,
  titleId,
  className = '',
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const prevIsOpenRef = useRef(false)

  if (isOpen && !prevIsOpenRef.current) {
    prevIsOpenRef.current = true
    if (typeof document !== 'undefined' && document.activeElement) {
      previousActiveElementRef.current = document.activeElement as HTMLElement
    }
  } else if (!isOpen && prevIsOpenRef.current) {
    prevIsOpenRef.current = false
  }

  // 1. Register with modalStack for native Android hardware Back
  useEffect(() => {
    if (!isOpen) return
    const unregister = registerModal(onClose)
    return () => {
      unregister()
    }
  }, [isOpen, onClose])

  // 2. Escape key listener
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // 3. Scroll lock
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  // 4. Focus management: store previous active element, focus dialog, trap Tab key
  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    if (!dialog) return

    const active = document.activeElement as HTMLElement | null
    if (active && !dialog.contains(active)) {
      previousActiveElementRef.current = active
    }

    // Find first focusable element or focus dialog container
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    } else {
      dialog.focus()
    }

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null)

      if (focusables.length === 0) {
        e.preventDefault()
        return
      }

      const firstElement = focusables[0]
      const lastElement = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    dialog.addEventListener('keydown', handleFocusTrap)

    return () => {
      dialog.removeEventListener('keydown', handleFocusTrap)
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus()
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
