import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useCountUp } from '../hooks/useCountUp'
import { ProgressLineChart } from '../components/ProgressLineChart'
import { DateStrip } from '../components/DateStrip'
import { BookingCard } from '../components/BookingCard'
import { Modal } from '../components/Modal'
import { clearModalStack, getModalStackDepth, popModal } from '../services/modalStack'
import type { Booking, Measurement } from '../types/domain'

describe('Remediation Pass: P1 Verification', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()
  })

  describe('C. useCountUp Hook', () => {
    it('initializes from startVal when provided and animates towards targetValue under React StrictMode', () => {
      vi.useFakeTimers()
      const { result } = renderHook(
        () => useCountUp(80.0, { duration: 300, decimals: 1, startVal: 75.0 }),
        { wrapper: React.StrictMode }
      )

      // On initial render with startVal, it should start near startVal, not immediately 80.0
      expect(result.current).toBe(75.0)

      // Advance halfway
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current).toBeGreaterThan(75.0)
      expect(result.current).toBeLessThanOrEqual(80.0)

      // Advance to end
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(result.current).toBe(80.0)
      vi.useRealTimers()
    })

    it('animates smoothly on targetValue prop updates under React StrictMode', () => {
      vi.useFakeTimers()
      let currentTarget = 80.0
      const { result, rerender } = renderHook(
        () => useCountUp(currentTarget, { duration: 300, decimals: 1 }),
        { wrapper: React.StrictMode }
      )

      // No startVal provided: initial mount sets targetValue directly
      expect(result.current).toBe(80.0)

      // Update targetValue
      currentTarget = 90.0
      rerender()

      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(result.current).toBeGreaterThan(80.0)
      expect(result.current).toBeLessThanOrEqual(90.0)

      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(result.current).toBe(90.0)
      vi.useRealTimers()
    })

    it('bypasses animation when prefers-reduced-motion is set', () => {
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }))

      const { result } = renderHook(() =>
        useCountUp(80.0, { duration: 300, decimals: 1, startVal: 75.0 })
      )
      // Immediately targetValue because user prefers reduced motion
      expect(result.current).toBe(80.0)
    })
  })

  describe('B. ProgressLineChart: Strict Period Filtering & Empty States', () => {
    const mockMeasurements: Measurement[] = [
      { id: '1', date: '2026-08-01', weight: 82.0 },
      { id: '2', date: '2026-08-10', weight: 81.5 },
      // Older than 30 days if today is Sept 7, 2026
      { id: '3', date: '2026-09-05', weight: 80.0 }, // within 7d
      { id: '4', date: '2026-09-06', weight: 79.8 }, // within 7d
    ]

    it('strictly bounds data points to active period without pulling older points', () => {
      let filteredPoints: Measurement[] = []
      render(
        <ProgressLineChart
          measurements={mockMeasurements}
          onPeriodChange={(_p, filtered) => {
            filteredPoints = filtered
          }}
        />
      )

      // Period selector defaults to 30d
      // Click 7d button
      const btn7d = screen.getByRole('button', { name: '7д' })
      fireEvent.click(btn7d)

      // Should only contain points within last 7 days (mock 3 and 4)
      filteredPoints.forEach((pt) => {
        const ptDate = new Date(pt.date).getTime()
        const cutoff = Date.now() - 7 * 86400000
        expect(ptDate).toBeGreaterThanOrEqual(cutoff)
      })
    })

    it('displays empty state message when 0 points are within the selected period', () => {
      // Data with only older points from months ago
      const oldMeasurements: Measurement[] = [
        { id: '1', date: '2025-01-01', weight: 85.0 },
      ]

      render(<ProgressLineChart measurements={oldMeasurements} />)

      // Click 7d
      const btn7d = screen.getByRole('button', { name: '7д' })
      fireEvent.click(btn7d)

      expect(screen.getByText('Нет данных за выбранный период')).toBeDefined()
    })
  })

  describe('D. Accessibility for Segmented Controls (Button Groups)', () => {
    it('uses role="group" and aria-pressed on ProgressLineChart period selector', () => {
      const mockMeasurements: Measurement[] = [
        { id: '1', date: '2026-09-01', weight: 80.0 },
      ]
      render(<ProgressLineChart measurements={mockMeasurements} />)

      const group = screen.getByRole('group', { name: /период графика/i })
      expect(group).toBeDefined()

      const activeBtn = screen.getByRole('button', { name: '30д' })
      expect(activeBtn.getAttribute('aria-pressed')).toBe('true')

      const inactiveBtn = screen.getByRole('button', { name: '7д' })
      expect(inactiveBtn.getAttribute('aria-pressed')).toBe('false')
    })

    it('uses role="group" and aria-pressed on DateStrip', () => {
      const days = [
        { id: '2026-09-07', weekday: 'ПН', day: 7, monthLabel: 'сентября' },
        { id: '2026-09-08', weekday: 'ВТ', day: 8, monthLabel: 'сентября' },
      ]
      render(<DateStrip days={days} selectedId="2026-09-07" onSelect={() => {}} />)

      const group = screen.getByRole('group', { name: /выбор даты записи/i })
      expect(group).toBeDefined()

      const selectedDay = screen.getByRole('button', { name: /ПН, 7 сентября/i })
      expect(selectedDay.getAttribute('aria-pressed')).toBe('true')

      const otherDay = screen.getByRole('button', { name: /ВТ, 8 сентября/i })
      expect(otherDay.getAttribute('aria-pressed')).toBe('false')
    })
  })

  describe('E. BookingCard: No Nested Interactive Conflicts', () => {
    it('does not place role="button" on card container when booked', () => {
      const mockBooking: Booking = {
        id: 'b-1',
        slotId: 's-1',
        userId: 'u-1',
        clientName: 'Алексей',
        title: 'Силовая тренировка',
        startAt: '10:00',
        endAt: '11:00',
        date: '2026-09-08',
        dateLabel: 'Завтра',
        trainerName: 'Ваня',
        trainerId: 'vanya',
        status: 'confirmed',
        createdAt: '2026-09-07T10:00:00Z',
        cancelledAt: null,
      }

      const { container } = render(
        <MemoryRouter>
          <BookingCard booking={mockBooking} />
        </MemoryRouter>
      )

      // Container card should NOT have role="button" or tabindex
      const card = container.querySelector('.main-card--booked')
      expect(card).not.toBeNull()
      expect(card?.getAttribute('role')).toBe('region')
      expect(card?.getAttribute('tabindex')).toBeNull()

      // Should have independent links
      const links = screen.getAllByRole('link')
      expect(links.length).toBeGreaterThanOrEqual(2)
      expect(links.some((l) => l.textContent?.includes('Подробнее'))).toBe(true)
      expect(links.some((l) => l.textContent?.includes('Другое время'))).toBe(true)
    })
  })

  describe('F. Modal Contract & Native Android Back via modalStack', () => {
    it('closes modal on Escape key press', () => {
      const onClose = vi.fn()
      render(
        <Modal isOpen={true} onClose={onClose} titleId="test-modal-title">
          <h2 id="test-modal-title">Тестовое модальное окно</h2>
        </Modal>
      )

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('manages modalStack in LIFO order for native Android hardware back', () => {
      const onCloseModal1 = vi.fn()
      const onCloseModal2 = vi.fn()

      const { unmount: unmount1 } = render(
        <Modal isOpen={true} onClose={onCloseModal1} titleId="m1">
          <h2 id="m1">Modal 1</h2>
        </Modal>
      )

      const { unmount: unmount2 } = render(
        <Modal isOpen={true} onClose={onCloseModal2} titleId="m2">
          <h2 id="m2">Modal 2</h2>
        </Modal>
      )

      expect(getModalStackDepth()).toBe(2)

      // Android back pressed once: should pop top modal (Modal 2)
      const handledTop = popModal()
      expect(handledTop).toBe(true)
      expect(onCloseModal2).toHaveBeenCalledTimes(1)
      expect(onCloseModal1).not.toHaveBeenCalled()

      unmount2()

      // Android back pressed again: should pop Modal 1
      const handledBottom = popModal()
      expect(handledBottom).toBe(true)
      expect(onCloseModal1).toHaveBeenCalledTimes(1)

      unmount1()

      // Stack empty: popModal returns false so app can handle navigation
      expect(popModal()).toBe(false)
    })
  })
})
