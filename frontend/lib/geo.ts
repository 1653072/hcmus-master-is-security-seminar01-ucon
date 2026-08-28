'use client'
import { api } from './api'

export async function captureAndSendGeo(): Promise<void> {
  if (!navigator.geolocation) return

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.geo.save(pos.coords.latitude, pos.coords.longitude)
        } catch (e) {
          console.warn('Geo capture failed:', e)
        }
        resolve()
      },
      () => resolve(), // fail silently
      { timeout: 5000 }
    )
  })
}
