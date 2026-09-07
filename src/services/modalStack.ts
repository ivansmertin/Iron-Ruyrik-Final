type ModalCloseHandler = () => void

const modalStack: ModalCloseHandler[] = []

/**
 * Registers an active modal in the global stack.
 * Returns an unregister function to call when the modal closes or unmounts.
 */
export function registerModal(onClose: ModalCloseHandler): () => void {
  modalStack.push(onClose)
  return () => {
    const index = modalStack.lastIndexOf(onClose)
    if (index !== -1) {
      modalStack.splice(index, 1)
    }
  }
}

/**
 * Pops and calls the topmost modal's close handler.
 * Returns true if a modal was handled, false if the stack was empty.
 */
export function popModal(): boolean {
  const handler = modalStack.pop()
  if (handler) {
    try {
      handler()
    } catch {
      // ignore handler error
    }
    return true
  }
  return false
}

/**
 * Returns true if at least one modal is currently registered and open.
 */
export function hasOpenModal(): boolean {
  return modalStack.length > 0
}

/**
 * Returns the current count of modals in the stack.
 */
export function getModalStackDepth(): number {
  return modalStack.length
}

/**
 * Resets the modal stack (for test cleanup).
 */
export function clearModalStack(): void {
  modalStack.length = 0
}
