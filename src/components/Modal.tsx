import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { popModal, registerModal } from '../services/modalStack'

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
  const backdropRef = useRef<HTMLDivElement>(null)
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
        e.stopImmediatePropagation()
        if (popModal()) {
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // 3. Scroll lock & Background AT isolation
  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Background AT / keyboard isolation: isolate elements outside modal
    const backdrop = backdropRef.current
    const affectedElements: { el: HTMLElement; prevAriaHidden: string | null; prevInert: boolean }[] = []

    if (backdrop && document.body) {
      const siblings = Array.from(document.body.children).filter(
        (child) => child !== backdrop && !child.contains(backdrop) && child.tagName !== 'SCRIPT'
      )
      siblings.forEach((child) => {
        const el = child as HTMLElement
        affectedElements.push({
          el,
          prevAriaHidden: el.getAttribute('aria-hidden'),
          prevInert: (el as HTMLElement & { inert?: boolean }).inert ?? false,
        })
        el.setAttribute('aria-hidden', 'true')
        try {
          ;(el as HTMLElement & { inert?: boolean }).inert = true
        } catch {
          // ignore if not supported in environment
        }
      })
    }

    return () => {
      document.body.style.overflow = originalOverflow
      affectedElements.forEach(({ el, prevAriaHidden, prevInert }) => {
        if (prevAriaHidden === null) {
          el.removeAttribute('aria-hidden')
        } else {
          el.setAttribute('aria-hidden', prevAriaHidden)
        }
        try {
          ;(el as HTMLElement & { inert?: boolean }).inert = prevInert
        } catch {
          // ignore
        }
      })
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

  const modalNode = (
    <div
      ref={backdropRef}
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

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body)
  }

  return modalNode
}
