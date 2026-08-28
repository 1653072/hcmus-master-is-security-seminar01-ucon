'use client'
import { useEffect, useRef, useState } from 'react'
import { api, getToken } from '@/lib/api'
import { useRouter, useParams, useSearchParams } from 'next/navigation'

export default function AdPlayerPage() {
  const [watchSeconds, setWatchSeconds] = useState(0)
  const [canProceed, setCanProceed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const rentalId = params.rentalId as string
  const adId = searchParams.get('ad_id') || ''
  const adTitle = searchParams.get('ad_title') || 'Advertisement'
  const adDurationParam = parseInt(searchParams.get('ad_duration') || '15', 10)
  const requiredSeconds = Math.max(15, adDurationParam >= 15 ? 15 : adDurationParam)

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  const token = getToken()
  const adStreamUrl = `${API_URL}/api/ads/${adId}/stream`

  const startTimer = () => {
    if (intervalRef.current) return
    intervalRef.current = setInterval(() => {
      setWatchSeconds(prev => {
        const next = prev + 1
        if (next >= requiredSeconds) setCanProceed(true)
        return next
      })
    }, 1000)
  }

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => stopTimer()
  }, [])

  const handleProceed = async () => {
    if (!canProceed || submitting) return
    setSubmitting(true)
    setError('')

    try {
      const result = await api.ads.complete(rentalId, adId, watchSeconds)
      if (!result.completed) {
        setError('Watch duration not sufficient. Please watch more of the ad.')
        setSubmitting(false)
        return
      }
      // Retry play now that obligation is satisfied
      const playRes = await api.rentals.play(rentalId)
      router.push(`/watch/${playRes.session_id}`)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setError(e.error || 'Failed to start movie')
      setSubmitting(false)
    }
  }

  const remaining = Math.max(0, requiredSeconds - watchSeconds)

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-4 bg-yellow-900/40 border border-yellow-600 rounded px-4 py-3">
          <p className="text-yellow-300 text-sm">
            <strong>UCON preB0 Obligation:</strong> As a basic_user (pay-per-rental), you must watch
            at least {requiredSeconds} seconds of this advertisement before your movie begins.
            This obligation is validated server-side.
          </p>
        </div>

        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={adStreamUrl}
            className="w-full"
            autoPlay
            onPlay={startTimer}
            onPause={stopTimer}
            onEnded={stopTimer}
            controls
          >
            {/* Fallback if token is needed as query param */}
          </video>
          <div className="absolute top-3 right-3 bg-black/80 px-3 py-1 rounded text-sm font-mono">
            {canProceed ? (
              <span className="text-green-400">✓ Obligation satisfied</span>
            ) : (
              <span className="text-yellow-300">{watchSeconds}s / {requiredSeconds}s</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-white">{adTitle}</p>
            <p className="text-sm text-gray-400 mt-1">
              {canProceed
                ? 'You may now start the movie.'
                : `Please watch ${remaining} more second${remaining !== 1 ? 's' : ''} to continue.`}
            </p>
          </div>

          <button
            onClick={handleProceed}
            disabled={!canProceed || submitting}
            className={`px-8 py-3 rounded font-medium transition-all ${
              canProceed && !submitting
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/50'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Starting...' : canProceed ? '▶ Start Movie' : `Wait ${remaining}s`}
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 text-xs text-gray-600 text-center">
          Session token: {token ? token.slice(0, 20) + '...' : 'none'} · Ad ID: {adId.slice(0, 8)}...
        </div>
      </div>
    </div>
  )
}
