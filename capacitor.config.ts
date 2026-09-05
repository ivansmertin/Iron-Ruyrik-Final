import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ru.ironryrik.app',
  appName: 'Железный Рюрик',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
