'use client'
import { useEffect, useState } from 'react'
import { api, type User, type OfflineDownloadWithMovie } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

export default function OfflinePage() {
  const [user, setUser] = useState<User | null>(null)
  const [downloads, setDownloads] = useState<OfflineDownloadWithMovie[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u) { router.push('/login'); return }
      if (u.account_type !== 'premium') { router.push('/subscription'); return }
      setUser(u)
      const ds = await api.offline.list().catch(() => [])
      setDownloads(ds)
      setLoading(false)
    }
    init()
  }, [router])

  const handleDelete = async (downloadId: string) => {
    try {
      await api.offline.delete(downloadId)
      setDownloads(ds => ds.filter(d => d.download_id !== downloadId))
      if (user) setUser(u => u ? { ...u, offline_count: Math.max(0, u.offline_count - 1) } : u)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      alert('Failed to delete: ' + (e.error || ''))
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Offline Downloads</h1>
        <div className="mb-6 p-3 bg-gray-900 rounded text-xs text-gray-500 border border-gray-800 space-y-1">
          <p><strong className="text-purple-400">UCON preA1:</strong> Maximum 5 movies allowed offline (offline_count checked atomically).</p>
          <p><strong className="text-purple-400">UCON onA3:</strong> Deleting a movie decrements offline_count on your account.</p>
          <p><strong className="text-purple-400">UCON onA0:</strong> Files are revoked (status=revoked) when subscription expires.</p>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Storage used: <span className="text-white font-medium">{user?.offline_count ?? 0}</span>/5 movies
        </p>

        {downloads.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">📥</p>
            <p>No offline downloads. Browse movies to download them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {downloads.map(d => (
              <div key={d.download_id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{d.movie_title}</p>
                  <p className="text-sm text-gray-400">{d.movie_genre} · {d.movie_duration_minutes} min</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Downloaded {new Date(d.downloaded_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(d.download_id)}
                  className="text-red-400 hover:text-red-300 text-sm border border-red-800 hover:border-red-600 px-3 py-1 rounded transition-colors">
                  Delete (onA3)
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
