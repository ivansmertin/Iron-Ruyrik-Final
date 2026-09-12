import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as clientModule from '../api/client'
import { ProgressLineChart } from '../components/ProgressLineChart'
import { ProgressPage } from '../pages/ProgressPage'
import type { Measurement } from '../types/domain'
import type { HealthProgress } from '../types/health'

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('M08 — Progress: real measurements, clean hierarchy, accessible chart', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  describe('1. First async value & cold load (no 0 -> value animation flash)', () => {
    it('renders the first async weight value immediately without animating from 0 or NaN', async () => {
      const mockHealth: HealthProgress = {
        visitsThisMonth: 0,
        consistentWeeks: 0,
        latestWeight: {
          metricType: 'weight',
          currentValue: 78.2,
          unit: 'kg',
          measuredAt: '2026-09-08T08:30:00+03:00',
          provenanceLabel: 'Apple Health (iPhone 15)',
          sourceProvider: 'apple_health',
          delta: null,
        },
        weightSeries: [
          {
            id: 'm1',
            date: '2026-09-08',
            measuredAt: '2026-09-08T08:30:00+03:00',
            value: 78.2,
            provenanceLabel: 'Apple Health (iPhone 15)',
            sourceProvider: 'apple_health',
          },
        ],
      }

      vi.spyOn(clientModule, 'apiRequest').mockResolvedValueOnce(mockHealth)

      renderWithClient(<ProgressPage />)

      // Should show the weight 78,2 immediately once loaded
      await waitFor(() => {
        expect(screen.getByText('78,2')).toBeDefined()
      })

      // Must not show 0 or NaN as current weight
      expect(screen.queryByText('0,0')).toBeNull()
      expect(screen.queryByText('NaN')).toBeNull()
      expect(screen.getAllByText('Apple Health (iPhone 15)').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('2. Error handling: canonical 500 / offline instead of fake 3/3 fallback', () => {
    it('shows real error state with retry button on canonical API failure', async () => {
      vi.spyOn(clientModule, 'apiRequest').mockRejectedValueOnce(
        new clientModule.ApiError(500, 'INTERNAL_ERROR', 'Internal Server Error')
      )

      renderWithClient(<ProgressPage />)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
      })

      expect(screen.getByText('Не удалось загрузить данные прогресса')).toBeDefined()
      expect(screen.getByRole('button', { name: 'Повторить' })).toBeDefined()

      // Ensure no fake 3/3 summary stats are shown
      expect(screen.queryByText(/недели подряд/i)).toBeNull()
      expect(screen.queryByText(/тренировок за месяц/i)).toBeNull()
    })
  })

  describe('3. Delta with visible baseline date and 1-measurement handling', () => {
    it('shows visible baseline date in weight delta when > 1 measurements exist', async () => {
      const mockHealth: HealthProgress = {
        visitsThisMonth: 0,
        consistentWeeks: 0,
        latestWeight: {
          metricType: 'weight',
          currentValue: 77.0,
          unit: 'kg',
          measuredAt: '2026-09-08T08:30:00+03:00',
          provenanceLabel: 'Внесено вручную',
          sourceProvider: 'manual',
          baselineValue: 78.2,
          baselineDate: '2026-06-01T10:00:00+03:00',
          delta: {
            diff: -1.2,
            formatted: '−1,2 кг',
            direction: 'down',
            label: '−1,2 кг с 1 июня',
          },
        },
        weightSeries: [
          {
            id: 'm1',
            date: '2026-06-01',
            measuredAt: '2026-06-01T10:00:00+03:00',
            value: 78.2,
            provenanceLabel: 'Внесено вручную',
            sourceProvider: 'manual',
          },
          {
            id: 'm2',
            date: '2026-09-08',
            measuredAt: '2026-09-08T08:30:00+03:00',
            value: 77.0,
            provenanceLabel: 'Внесено вручную',
            sourceProvider: 'manual',
          },
        ],
      }

      vi.spyOn(clientModule, 'apiRequest').mockResolvedValueOnce(mockHealth)

      renderWithClient(<ProgressPage />)

      await waitFor(() => {
        expect(screen.getByText('77,0')).toBeDefined()
      })

      // The baseline date must be visibly displayed
      expect(screen.getByText('−1,2 кг с 1 июня')).toBeDefined()
    })

    it('does not display delta when only 1 measurement exists', async () => {
      const mockHealth: HealthProgress = {
        visitsThisMonth: 0,
        consistentWeeks: 0,
        latestWeight: {
          metricType: 'weight',
          currentValue: 80.0,
          unit: 'kg',
          measuredAt: '2026-09-08T08:30:00+03:00',
          provenanceLabel: 'Внесено вручную',
          sourceProvider: 'manual',
          delta: null,
        },
        weightSeries: [
          {
            id: 'm1',
            date: '2026-09-08',
            measuredAt: '2026-09-08T08:30:00+03:00',
            value: 80.0,
            provenanceLabel: 'Внесено вручную',
            sourceProvider: 'manual',
          },
        ],
      }

      vi.spyOn(clientModule, 'apiRequest').mockResolvedValueOnce(mockHealth)

      renderWithClient(<ProgressPage />)

      await waitFor(() => {
        expect(screen.getByText('80,0')).toBeDefined()
      })

      // Delta change badge should not exist
      expect(screen.queryByTitle(/изменение/i)).toBeNull()
      expect(screen.queryByText(/с /)).toBeNull()
    })
  })

  describe('4. Secondary body metrics autonomy & terminology', () => {
    it('displays secondary body metrics even if weight is completely missing', async () => {
      const mockHealth: HealthProgress = {
        visitsThisMonth: 0,
        consistentWeeks: 0,
        latestWeight: null,
        latestBodyFat: {
          metricType: 'body_fat_percentage',
          currentValue: 14.5,
          unit: 'percent',
          measuredAt: '2026-09-08T08:30:00+03:00',
          provenanceLabel: 'Xiaomi Scale S400',
          sourceProvider: 'xiaomi',
          delta: null,
        },
        latestMuscleMass: {
          metricType: 'lean_body_mass',
          currentValue: 38.0,
          unit: 'kg',
          measuredAt: '2026-09-08T08:30:00+03:00',
          provenanceLabel: 'Xiaomi Scale S400',
          sourceProvider: 'xiaomi',
          delta: null,
        },
        weightSeries: [],
      }

      vi.spyOn(clientModule, 'apiRequest').mockResolvedValueOnce(mockHealth)

      renderWithClient(<ProgressPage />)

      await waitFor(() => {
        expect(screen.getByText('Пока нет данных о весе')).toBeDefined()
      })

      // Body fat is displayed
      expect(screen.getByText('Процент жира')).toBeDefined()
      expect(screen.getByText('14,5 %')).toBeDefined()

      // Lean body mass is correctly titled "Безжировая масса", NOT "Мышечная масса"
      expect(screen.getByText('Безжировая масса')).toBeDefined()
      expect(screen.getByText('38,0 кг')).toBeDefined()
    })
  })

  describe('5. ProgressLineChart: Proportional timestamps & edge cases', () => {
    it('plots points with proportional X intervals corresponding to real timestamps', () => {
      // 3 points: 2026-09-01 10:00, 2026-09-02 10:00 (1 day gap), 2026-09-22 10:00 (20 days gap)
      const measurements: Measurement[] = [
        { id: '1', date: '2026-09-01', measuredAt: '2026-09-01T10:00:00', weight: 80.0 },
        { id: '2', date: '2026-09-02', measuredAt: '2026-09-02T10:00:00', weight: 80.5 },
        { id: '3', date: '2026-09-22', measuredAt: '2026-09-22T10:00:00', weight: 81.0 },
      ]

      const { container } = render(<ProgressLineChart measurements={measurements} />)

      // SVG path line
      const path = container.querySelector('.line-chart__line')
      expect(path).toBeDefined()
      const d = path?.getAttribute('d') ?? ''
      // Path format: M x0 y0 L x1 y1 L x2 y2
      const segments = d.split('L')
      expect(segments.length).toBe(3)

      const x0 = parseFloat(segments[0].replace('M', '').trim().split(' ')[0])
      const x1 = parseFloat(segments[1].trim().split(' ')[0])
      const x2 = parseFloat(segments[2].trim().split(' ')[0])

      // x0 to x1 is 1 day, x1 to x2 is 20 days: interval (x2 - x1) must be substantially larger than (x1 - x0)
      const gap1 = x1 - x0
      const gap2 = x2 - x1
      expect(gap2).toBeGreaterThan(gap1 * 10)
    })

    it('handles flat series (identical weights) gracefully without division by zero', () => {
      const flatMeasurements: Measurement[] = [
        { id: '1', date: '2026-09-05', measuredAt: '2026-09-05T10:00:00', weight: 80.0 },
        { id: '2', date: '2026-09-06', measuredAt: '2026-09-06T10:00:00', weight: 80.0 },
      ]

      const { container } = render(<ProgressLineChart measurements={flatMeasurements} />)
      const path = container.querySelector('.line-chart__line')
      expect(path).toBeDefined()
      expect(path?.getAttribute('d')).not.toContain('NaN')
    })

    it('handles single point by centering it in the chart', () => {
      const singleMeasurement: Measurement[] = [
        { id: '1', date: '2026-09-05', measuredAt: '2026-09-05T10:00:00', weight: 80.0 },
      ]

      const { container } = render(<ProgressLineChart measurements={singleMeasurement} />)
      const circle = container.querySelector('.line-chart__dot')
      expect(circle).toBeDefined()
      // Center X = 160 (320 / 2)
      expect(circle?.getAttribute('cx')).toBe('160')
    })

    it('handles multiple measurements on the exact same timestamp without division by zero', () => {
      const sameTimeMeasurements: Measurement[] = [
        { id: '1', date: '2026-09-05', measuredAt: '2026-09-05T10:00:00', weight: 80.0 },
        { id: '2', date: '2026-09-05', measuredAt: '2026-09-05T10:00:00', weight: 80.2 },
      ]

      const { container } = render(<ProgressLineChart measurements={sameTimeMeasurements} />)
      const dots = container.querySelectorAll('.line-chart__dot')
      expect(dots.length).toBe(2)
      // Both points share identical timestamp, so they must have the exact same X coordinate
      expect(dots[0].getAttribute('cx')).toBe(dots[1].getAttribute('cx'))
      expect(dots[0].getAttribute('cx')).toBe('160')
    })
  })

  describe('6. SVG Accessibility & Fixed Readout Navigation', () => {
    it('has aria-hidden on SVG and no interactive focusable descendants inside SVG', () => {
      const measurements: Measurement[] = [
        { id: '1', date: '2026-09-05', measuredAt: '2026-09-05T10:00:00', weight: 80.0 },
        { id: '2', date: '2026-09-06', measuredAt: '2026-09-06T10:00:00', weight: 79.5 },
      ]

      const { container } = render(<ProgressLineChart measurements={measurements} />)
      const svg = container.querySelector('svg.line-chart__svg')
      expect(svg?.getAttribute('aria-hidden')).toBe('true')

      // Ensure no buttons, tabIndexes, or roles exist inside the aria-hidden SVG
      const interactiveInsideSvg = svg?.querySelectorAll('[tabindex], [role="button"], button')
      expect(interactiveInsideSvg?.length).toBe(0)
    })

    it('allows navigating points via Prev / Next buttons in fixed readout', () => {
      const measurements: Measurement[] = [
        {
          id: '1',
          date: '2026-09-05',
          measuredAt: '2026-09-05T08:00:00',
          weight: 80.0,
          provenanceLabel: 'Внесено вручную',
        },
        {
          id: '2',
          date: '2026-09-06',
          measuredAt: '2026-09-06T09:00:00',
          weight: 79.5,
          provenanceLabel: 'Apple Health',
        },
      ]

      render(<ProgressLineChart measurements={measurements} />)

      // Defaults to the latest point (80.0 -> 79.5)
      expect(screen.getByText('79,5 кг')).toBeDefined()
      expect(screen.getByText('Apple Health')).toBeDefined()

      const prevBtn = screen.getByRole('button', { name: 'Предыдущий замер' })
      expect(prevBtn).toBeDefined()
      fireEvent.click(prevBtn)

      // Navigated to previous point
      expect(screen.getByText('80,0 кг')).toBeDefined()
      expect(screen.getByText('Внесено вручную')).toBeDefined()

      const nextBtn = screen.getByRole('button', { name: 'Следующий замер' })
      fireEvent.click(nextBtn)
      expect(screen.getByText('79,5 кг')).toBeDefined()
    })

    it('renders accessible expandable data list allowing keyboard selection', () => {
      const measurements: Measurement[] = [
        {
          id: '1',
          date: '2026-09-05',
          measuredAt: '2026-09-05T08:00:00',
          weight: 80.0,
          provenanceLabel: 'Внесено вручную',
        },
        {
          id: '2',
          date: '2026-09-06',
          measuredAt: '2026-09-06T09:00:00',
          weight: 79.5,
          provenanceLabel: 'Apple Health',
        },
      ]

      render(<ProgressLineChart measurements={measurements} />)

      const toggleBtn = screen.getByRole('button', { name: /Все замеры за период \(2\)/i })
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')

      fireEvent.click(toggleBtn)
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')

      // List of measurements is visible
      const list = screen.getByRole('list')
      expect(list).toBeDefined()

      // Click first item in list
      const itemBtn = screen.getByRole('button', { name: /80,0 кг/i })
      fireEvent.click(itemBtn)

      // Readout now updates to 80,0 кг
      const readout = screen.getByRole('region', { name: 'Выбранный замер' })
      expect(within(readout).getByText(/80,0/)).toBeDefined()
    })
  })
})
