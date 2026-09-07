export type MotionCategory = 'micro' | 'ui' | 'page' | 'reveal'

export type MotionEasingToken =
  | 'standard'
  | 'enter'
  | 'exit'
  | 'emphasized'
  | 'direct'

export interface MotionDurationConfig {
  readonly microFast: number
  readonly micro: number
  readonly uiFast: number
  readonly ui: number
  readonly pageFast: number
  readonly page: number
  readonly revealFast: number
  readonly reveal: number
}

export interface MotionEasingConfig {
  readonly standard: string
  readonly enter: string
  readonly exit: string
  readonly emphasized: string
  readonly direct: string
}
