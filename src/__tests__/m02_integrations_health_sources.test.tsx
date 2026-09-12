import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntegrationsPage } from '../pages/IntegrationsPage'
import { HealthSourcesModal } from '../components/HealthSourcesModal'
import { Modal } from '../components/Modal'
import {
  cleanupLegacyIntegrationsStorage,
  formatLastSync,
} from '../hooks/useHealthSources'
import { HEALTH_PERMISSION_EXPLANATION } from '../services/healthBridge'
import { clearModalStack, getModalStackDepth, popModal } from '../services/modalStack'
import * as healthApi from '../api/health'
import type { HealthSourceConnection } from '../types/health'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

const mockSources: HealthSourceConnection[] = [
  {
    id: 'apple-1',
    provider: 'apple_health',
    status: 'disconnected',
    displayName: 'Apple Health',
    category: 'device',
    requiresNativeBridge: true,
    description: 'HealthKit integration',
    lastSyncedAt: null,
  },
  {
    id: 'hc-1',
    provider: 'health_connect',
    status: 'disconnected',
    displayName: 'Health Connect',
    category: 'device',
    requiresNativeBridge: true,
    description: 'Android Health Connect',
    lastSyncedAt: null,
  },
  {
    id: 'garmin-1',
    provider: 'garmin',
    status: 'disconnected',
    displayName: 'Garmin Connect',
    category: 'service',
    requiresNativeBridge: false,
    description: 'Garmin Cloud integration',
    lastSyncedAt: null,
  },
]

describe('Milestone M02: Integrations & HealthSources Unified Truth', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()
    localStorage.clear()
    vi.spyOn(healthApi, 'getHealthSources').mockResolvedValue(mockSources)
  })

  describe('1. Legacy Storage Sanitization', () => {
    it('removes corrupted ryrik_integrations key from localStorage', () => {
      localStorage.setItem(
        'ryrik_integrations',
        JSON.stringify([{ id: 'mock', icon: '<Component />' }])
      )
      expect(localStorage.getItem('ryrik_integrations')).not.toBeNull()

      cleanupLegacyIntegrationsStorage()
      expect(localStorage.getItem('ryrik_integrations')).toBeNull()
    })
  })

  describe('2. Copy Correction: LeanBodyMassRecord', () => {
    it('uses "Безжировая масса (LeanBodyMassRecord)" in Health Connect explanation', () => {
      const hc = HEALTH_PERMISSION_EXPLANATION.health_connect
      expect(hc.requestedData).toContain('Безжировая масса (LeanBodyMassRecord)')
      expect(hc.requestedData).not.toContain('Мышечная масса (LeanBodyMassRecord)')
    })
  })

  describe('3. Truthful Date Formatting (formatLastSync)', () => {
    it('returns "Синхронизация не выполнялась" for null or undefined dates', () => {
      expect(formatLastSync(null)).toBe('Синхронизация не выполнялась')
      expect(formatLastSync(undefined)).toBe('Синхронизация не выполнялась')
    })

    it('returns "Только что" for timestamps within the last 60 seconds', () => {
      const nowIso = new Date().toISOString()
      expect(formatLastSync(nowIso)).toBe('Только что')
    })

    it('formats today timestamps with "Сегодня, HH:MM"', () => {
      const earlierToday = new Date()
      earlierToday.setHours(8, 30, 0, 0)
      // Ensure it's not within 60s
      if (Date.now() - earlierToday.getTime() > 60_000) {
        expect(formatLastSync(earlierToday.toISOString())).toBe('Сегодня, 08:30')
      }
    })
  })

  describe('4. LIFO Escape & Android Hardware Back in HealthSourcesModal', () => {
    it('closes permissions sub-step on Escape, keeping main modal open; second Escape closes modal', async () => {
      const onClose = vi.fn()
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <HealthSourcesModal isOpen={true} onClose={onClose} />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Apple Health')).toBeDefined()
      })

      // Click "Подключить" on Apple Health to open permission sub-step
      const connectButtons = screen.getAllByRole('button', { name: 'Подключить' })
      await act(async () => {
        fireEvent.click(connectButtons[0])
      })

      // Permission explainer sub-step must now be visible
      expect(screen.getByRole('region', { name: 'Разрешения источника' })).toBeDefined()
      expect(screen.getByText(/Запрашиваемые показатели/i)).toBeDefined()

      // Press Escape first time: should close sub-step, NOT the modal
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })

      expect(screen.queryByRole('region', { name: 'Разрешения источника' })).toBeNull()
      expect(onClose).not.toHaveBeenCalled()

      // Press Escape second time: should now close the modal itself
      await act(async () => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('pops sub-step first via popModal() (hardware Back), then closes modal', async () => {
      const onClose = vi.fn()
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <HealthSourcesModal isOpen={true} onClose={onClose} />
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Apple Health')).toBeDefined()
      })

      // Stack depth initially has 1 (the modal itself)
      expect(getModalStackDepth()).toBe(1)

      // Open permission sub-step
      const connectButtons = screen.getAllByRole('button', { name: 'Подключить' })
      await act(async () => {
        fireEvent.click(connectButtons[0])
      })

      // Stack depth now has 2 (modal + sub-step)
      expect(getModalStackDepth()).toBe(2)

      // Hardware back press 1: pops top sub-step
      await act(async () => {
        const handled = popModal()
        expect(handled).toBe(true)
      })

      expect(screen.queryByRole('region', { name: 'Разрешения источника' })).toBeNull()
      expect(onClose).not.toHaveBeenCalled()
      expect(getModalStackDepth()).toBe(1)

      // Hardware back press 2: pops modal
      await act(async () => {
        const handled = popModal()
        expect(handled).toBe(true)
      })

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(getModalStackDepth()).toBe(0)
    })
  })

  describe('5. Web Platform Honesty & No Fake Connections', () => {
    it('shows web sandbox banner and disables fake auto-sync on web', async () => {
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <IntegrationsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Веб-окружение')).toBeDefined()
      })

      expect(
        screen.getByText(/Прямое считывание Apple Health и Health Connect доступно только в нативном мобильном приложении/i)
      ).toBeDefined()

      // Click "Подключить" for Apple Health
      const connectButtons = screen.getAllByRole('button', { name: 'Подключить' })
      await act(async () => {
        fireEvent.click(connectButtons[0])
      })

      // Sub-step opens with explicit requirement note
      const modal = screen.getByRole('dialog')
      expect(modal).toBeDefined()
      expect(screen.getByText('Требуется нативное приложение')).toBeDefined()

      // Button is disabled on web to prevent fake connections
      const submitBtn = screen.getByRole('button', { name: 'Требуется нативное приложение' })
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  describe('6. Honest Integrations Count & Aggregator Xiaomi', () => {
    it('shows 1 из 3 активно and does not double-count Xiaomi when only Apple Health is connected', async () => {
      const connectedApple: HealthSourceConnection[] = [
        {
          id: 'apple-1',
          provider: 'apple_health',
          status: 'connected',
          displayName: 'Apple Health',
          category: 'device',
          requiresNativeBridge: true,
          description: 'HealthKit integration',
          lastSyncedAt: '2026-09-11T10:00:00Z',
        },
        {
          id: 'hc-1',
          provider: 'health_connect',
          status: 'disconnected',
          displayName: 'Health Connect',
          category: 'device',
          requiresNativeBridge: true,
          description: 'Android Health Connect',
          lastSyncedAt: null,
        },
        {
          id: 'garmin-1',
          provider: 'garmin',
          status: 'disconnected',
          displayName: 'Garmin Connect',
          category: 'service',
          requiresNativeBridge: false,
          description: 'Garmin Cloud integration',
          lastSyncedAt: null,
        },
      ]

      vi.spyOn(healthApi, 'getHealthSources').mockResolvedValue(connectedApple)
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <IntegrationsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('1 из 3 активно')).toBeDefined()
      })

      // Xiaomi item shows that data arrives via Apple Health, not active direct connected
      expect(screen.getByText(/Данные весов поступают через Apple Health/i)).toBeDefined()
    })
  })

  describe('7. Error State Isolation on API Failure', () => {
    it('renders honest error state with retry button in IntegrationsPage when getHealthSources fails', async () => {
      vi.spyOn(healthApi, 'getHealthSources').mockRejectedValueOnce(new Error('Network error'))
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <IntegrationsPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      expect(await screen.findByText('Не удалось загрузить источники данных')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeDefined()
    })

    it('renders honest error state with retry button in HealthSourcesModal when getHealthSources fails', async () => {
      vi.spyOn(healthApi, 'getHealthSources').mockRejectedValueOnce(new Error('Network error'))
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <HealthSourcesModal isOpen={true} onClose={() => {}} />
        </QueryClientProvider>
      )

      expect(await screen.findByText('Не удалось загрузить источники данных')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeDefined()
    })
  })

  describe('8. Modal Background DOM Isolation via Portal & inert', () => {
    it('isolates background siblings in document.body with aria-hidden and inert while open, and restores them on close', () => {
      const backgroundEl = document.createElement('div')
      backgroundEl.id = 'test-bg'
      document.body.appendChild(backgroundEl)

      const { unmount } = render(
        <Modal isOpen={true} onClose={() => {}} titleId="m-iso">
          <h2 id="m-iso">Isolated Modal</h2>
        </Modal>
      )

      expect(backgroundEl.getAttribute('aria-hidden')).toBe('true')
      expect((backgroundEl as HTMLElement & { inert?: boolean }).inert).toBe(true)

      unmount()

      expect(backgroundEl.getAttribute('aria-hidden')).toBeNull()
      expect((backgroundEl as HTMLElement & { inert?: boolean }).inert).toBe(false)
      document.body.removeChild(backgroundEl)
    })
  })
})
