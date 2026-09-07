import type { MotionDurationConfig, MotionEasingConfig } from '../types/motion'

/**
 * Zhelezny Ryrik Athletic Motion Durations (in milliseconds)
 */
export const MOTION_DURATIONS: MotionDurationConfig = {
  microFast: 90,
  micro: 120,
  uiFast: 180,
  ui: 220,
  pageFast: 280,
  page: 340,
  revealFast: 380,
  reveal: 480,
} as const

/** Named holds for transient state feedback; these are not animation durations. */
export const MOTION_FEEDBACK_DELAYS = {
  success: 700,
} as const

/**
 * Athletic Easing Curves (Cubic Bezier strings)
 * Decisive, athletic, controlled deceleration with zero cartoon bounce
 */
export const MOTION_EASINGS: MotionEasingConfig = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  enter: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  exit: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
  direct: 'cubic-bezier(0.25, 1, 0.5, 1)',
} as const

/**
 * Helper to get CSS duration variable name
 */
export const MOTION_CSS_VARS = {
  durationMicroFast: 'var(--motion-duration-micro-fast)',
  durationMicro: 'var(--motion-duration-micro)',
  durationUiFast: 'var(--motion-duration-ui-fast)',
  durationUi: 'var(--motion-duration-ui)',
  durationPageFast: 'var(--motion-duration-page-fast)',
  durationPage: 'var(--motion-duration-page)',
  durationRevealFast: 'var(--motion-duration-reveal-fast)',
  durationReveal: 'var(--motion-duration-reveal)',
  easeStandard: 'var(--motion-ease-standard)',
  easeEnter: 'var(--motion-ease-enter)',
  easeExit: 'var(--motion-ease-exit)',
  easeEmphasized: 'var(--motion-ease-emphasized)',
  easeDirect: 'var(--motion-ease-direct)',
} as const
