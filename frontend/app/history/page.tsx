'use client'
import { useEffect, useState } from 'react'
import { api, type User, type HistoryWithMovie } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

export default function HistoryPage() {
  const [user, setUser] = useState<User | null>(null)
  const [history, setHistory] = useState<HistoryWithMovie[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u) { router.push('/login'); return }
      setUser(u)
      const res = await api.history.list().catch(() => ({ history: [] }))
      setHistory(res.history || [])
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Watch History</h1>
        <div className="mb-6 p-3 bg-gray-900 rounded text-xs text-gray-500 border border-gray-800">
          <strong className="text-purple-400">UCON preA0:</strong> Only records belonging to your account are returned.
          The DELETE right on watch_history is denied to all roles — records exist as an immutable audit trail
          (preA0 authorization denial at API layer).
        </div>

        {history.length === 0 ? (
          <p className="text-gray-400">No watch history yet. Start watching movies!</p>
        ) : (
          <div className="space-y-3">
            {history.map(h => {
              const start = new Date(h.watch_start)
              const end = new Date(h.watch_end)
              const durationMs = end.getTime() - start.getTime()
              const durationMin = Math.floor(durationMs / 60000)
              return (
                <div key={h.history_id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white">{h.movie_title}</p>
                      <p className="text-sm text-gray-400">{h.movie_genre} · {h.movie_duration_minutes} min</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {start.toLocaleString()} → {end.toLocaleString()}
                        {durationMin > 0 && <span className="ml-2 text-gray-600">({durationMin} min watched)</span>}
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 max-w-32 truncate ml-4">
                      {h.device_info.slice(0, 25)}...
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
