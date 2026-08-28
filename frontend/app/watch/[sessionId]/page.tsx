'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { api, getToken } from '@/lib/api'
import { useRouter, useParams } from 'next/navigation'

type SessionStatus = 'active' | 'revoked' | 'ended'

export default function WatchPage() {
  const [status, setStatus] = useState<SessionStatus>('active')
  const [revokeReason, setRevokeReason] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [sseConnected, setSseConnected] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const sseRef = useRef<EventSource | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
  const videoSrc = `${API_URL}/api/stream/${sessionId}`

  const closeSession = useCallback(async () => {
    sseRef.current?.close()
    if (timerRef.current) clearInterval(timerRef.current)
    await api.sessions.stop(sessionId).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    const token = getToken()
    const sseUrl = `${API_URL}/api/sessions/${sessionId}/events?token=${token}`
    const sse = new EventSource(sseUrl)
    sseRef.current = sse

    sse.addEventListener('CONNECTED', () => setSseConnected(true))

    sse.addEventListener('REVOKED', (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      setRevokeReason(data.reason || 'session_expired')
      setStatus('revoked')
      videoRef.current?.pause()
      sse.close()
      if (timerRef.current) clearInterval(timerRef.current)
    })

    sse.addEventListener('HEARTBEAT', () => {
      // session still valid — no action needed
    })

    sse.addEventListener('CLOSED', () => {
      setStatus('ended')
      sse.close()
      if (timerRef.current) clearInterval(timerRef.current)
    })

    sse.onerror = () => {
      setSseConnected(false)
    }

    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)

    return () => {
      sse.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionId, API_URL])

  const handleStop = async () => {
    await closeSession()
    setStatus('ended')
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  if (status === 'revoked') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⛔</div>
          <h2 className="text-2xl font-bold text-red-400 mb-3">Session Revoked</h2>
          <p className="text-gray-300 mb-3">
            <strong className="text-purple-400">UCON onA0 — Continuity of Decisions:</strong>{' '}
            Your session was automatically terminated because{' '}
            {revokeReason === 'rental_expired'
              ? 'your 72-hour rental window has expired.'
              : 'your premium subscription has expired.'}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            The Policy Decision Point continuously monitored session conditions every 15 seconds
            and revoked access when the predicate became false.
            Your watch history has been recorded (onA3).
          </p>
          <button onClick={() => router.push('/')}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
            Back to Browse
          </button>
        </div>
      </div>
    )
  }

  if (status === 'ended') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-2xl font-bold mb-3">Session Ended</h2>
          <p className="text-gray-400 mb-2">Watched for {formatTime(elapsed)}</p>
          <p className="text-sm text-gray-500 mb-6">
            Watch history recorded (UCON onA3). Device count decremented if subscription session.
          </p>
          <button onClick={() => router.push('/')}
            className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium">
            Back to Browse
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-black">
        <div className="w-full max-w-5xl px-4">
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full rounded-lg shadow-2xl"
            controls
            autoPlay
          />
        </div>
      </div>

      <div className="bg-gray-900 border-t border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">Session: {sessionId.slice(0, 8)}...</span>
            <span className="text-green-400 font-medium">● Active — {formatTime(elapsed)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded border ${
              sseConnected
                ? 'border-green-800 bg-green-900/30 text-green-400'
                : 'border-gray-700 bg-gray-800 text-gray-500'
            }`}>
              SSE {sseConnected ? 'connected' : 'connecting'} — onA0 check every 15s
            </span>
            <button onClick={handleStop}
              className="bg-red-700 hover:bg-red-600 px-4 py-2 rounded text-sm font-medium transition-colors">
              Stop & Exit (onA3)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
