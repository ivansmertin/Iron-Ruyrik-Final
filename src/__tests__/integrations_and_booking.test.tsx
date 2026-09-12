import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntegrationsPage } from '../pages/IntegrationsPage'
import { Modal } from '../components/Modal'
import { Divider } from '../components/ui'
import { clearModalStack } from '../services/modalStack'

vi.mock('../api/health', () => ({
  getHealthSources: vi.fn().mockResolvedValue([]),
  connectHealthSource: vi.fn().mockResolvedValue({ status: 'connected' }),
  disconnectHealthSource: vi.fn().mockResolvedValue({ status: 'disconnected' }),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe('Integrations & Primitives Verification', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()
  })

  describe('Integrations Reversion: Xiaomi / Zepp Life', () => {
    it('displays Xiaomi / Zepp Life and no WHOOP reference', async () => {
      const queryClient = createTestQueryClient()
      await act(async () => {
        render(
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <IntegrationsPage />
            </MemoryRouter>
          </QueryClientProvider>
        )
      })

      // Xiaomi / Zepp Life must be present
      expect(screen.getByText('Xiaomi / Zepp Life')).toBeDefined()
      expect(screen.getByText(/Синхронизация биоимпедансных весов/i)).toBeDefined()

      // WHOOP must NOT be present
      expect(screen.queryByText(/WHOOP/i)).toBeNull()
    })
  })

  describe('Modal Accessibility & Lifecycle', () => {
    it('closes on backdrop click', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose} titleId="test-modal">
          <h2 id="test-modal">Test Modal</h2>
        </Modal>
      )

      const backdrop = screen.getByRole('presentation')
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('locks body overflow while open and restores it when closed', () => {
      document.body.style.overflow = 'auto'
      const { unmount } = render(
        <Modal isOpen={true} onClose={() => {}} titleId="test-modal">
          <h2 id="test-modal">Test Modal</h2>
        </Modal>
      )

      expect(document.body.style.overflow).toBe('hidden')
      unmount()
      expect(document.body.style.overflow).toBe('auto')
    })
  })

  describe('Divider Primitive Accessibility', () => {
    it('renders aria-hidden="true" when decorative (default)', () => {
      const { container } = render(<Divider />)
      const el = container.querySelector('.divider')
      expect(el).not.toBeNull()
      expect(el?.getAttribute('aria-hidden')).toBe('true')
      expect(el?.getAttribute('role')).toBeNull()
    })

    it('renders role="separator" and aria-orientation when decorative=false', () => {
      const { container } = render(<Divider decorative={false} orientation="vertical" />)
      const el = container.querySelector('.divider')
      expect(el).not.toBeNull()
      expect(el?.getAttribute('role')).toBe('separator')
      expect(el?.getAttribute('aria-orientation')).toBe('vertical')
      expect(el?.getAttribute('aria-hidden')).toBeNull()
    })
  })
})
