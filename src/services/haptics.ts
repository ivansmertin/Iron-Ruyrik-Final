import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/**
 * Centralized Haptics Service for Zhelezny Ryrik.
 * Provides subtle, athletic tactile feedback on native Capacitor platforms.
 * Completely silent on web browser fallback.
 */
class HapticsService {
  private isNativePlatform(): boolean {
    if (typeof window === 'undefined') return false
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      ?.Capacitor
    return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
  }

  /**
   * Subtle selection click for discrete UI choices (Date selector, Mode radio switch)
   */
  async selection(): Promise<void> {
    try {
      if (this.isNativePlatform()) {
        await Haptics.selectionStart()
        await Haptics.selectionChanged()
        await Haptics.selectionEnd()
      }
    } catch {
      // Silent fallback
    }
  }

  /**
   * Light physical tap impact
   */
  async light(): Promise<void> {
    try {
      if (this.isNativePlatform()) {
        await Haptics.impact({ style: ImpactStyle.Light })
      }
    } catch {
      // Silent fallback
    }
  }

  /**
   * Success notification feedback (Workout confirmed)
   */
  async success(): Promise<void> {
    try {
      if (this.isNativePlatform()) {
        await Haptics.notification({ type: NotificationType.Success })
      }
    } catch {
      // Silent fallback
    }
  }

  /**
   * Warning / Destructive notification feedback (Cancel booking, Logout confirm)
   */
  async warning(): Promise<void> {
    try {
      if (this.isNativePlatform()) {
        await Haptics.notification({ type: NotificationType.Warning })
      }
    } catch {
      // Silent fallback
    }
  }
}

export const haptics = new HapticsService()
