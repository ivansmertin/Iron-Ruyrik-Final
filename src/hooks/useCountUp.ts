import { useEffect, useRef, useState } from 'react'
import { MOTION_DURATIONS } from '../utils/motion'
import { useReducedMotion } from './useReducedMotion'

interface UseCountUpOptions {
  duration?: number // duration in ms (defaults to reveal duration: 480ms)
  decimals?: number // decimal places (defaults to 0)
  startVal?: number // initial value (defaults to 0 or previous value)
}

/**
 * Hook to smoothly assemble and resolve numbers (hero metrics, visits, capacity).
 * Uses cubic ease-out curve to mimic --motion-ease-emphasized.
 * Automatically bypassed when prefers-reduced-motion is active.
 */
export function useCountUp(targetValue: number, options?: UseCountUpOptions): number
export function useCountUp(targetValue: number | undefined, options?: UseCountUpOptions): number | undefined
export function useCountUp(
  targetValue: number | undefined,
  options: UseCountUpOptions = {}
): number | undefined {
  const { duration = MOTION_DURATIONS.reveal, decimals = 0, startVal } = options
  const prefersReduced = useReducedMotion()

  const [value, setValue] = useState<number | undefined>(() => {
    if (targetValue === undefined) return undefined
    if (prefersReduced || duration <= 0) return targetValue
    return startVal !== undefined ? startVal : targetValue
  })

  const currentValRef = useRef<number | undefined>(value)
  const prevStartValRef = useRef<number | undefined>(startVal)

  useEffect(() => {
    if (targetValue === undefined) {
      setValue(undefined)
      currentValRef.current = undefined
      return
    }

    // If reduced motion is requested or duration is 0, render target value immediately
    if (prefersReduced || duration <= 0) {
      setValue(targetValue)
      currentValRef.current = targetValue
      return
    }

    // If startVal prop was explicitly updated on a subsequent render, re-anchor starting position
    if (startVal !== prevStartValRef.current) {
      prevStartValRef.current = startVal
      if (startVal !== undefined) {
        currentValRef.current = startVal
        setValue(startVal)
      }
    }

    // If previous value was undefined (first async value arrived) and no startVal, render immediately without count-up
    if (currentValRef.current === undefined) {
      const initial = startVal !== undefined ? startVal : targetValue
      currentValRef.current = initial
      setValue(initial)
      if (initial === targetValue) {
        return
      }
    }

    const from = currentValRef.current
    if (from === targetValue) {
      setValue(targetValue)
      return
    }

    let startTimestamp: number | null = null
    let frameId: number

    // Athletic deceleration curve approximating --motion-ease-emphasized
    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp
      const elapsed = timestamp - startTimestamp
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutCubic(progress)

      const currentRaw = from + (targetValue - from) * easedProgress
      const multiplier = Math.pow(10, decimals)
      const rounded = Math.round(currentRaw * multiplier) / multiplier
      currentValRef.current = rounded
      setValue(rounded)

      if (progress < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        currentValRef.current = targetValue
        setValue(targetValue)
      }
    }

    frameId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [targetValue, duration, decimals, startVal, prefersReduced])

  return value
}
