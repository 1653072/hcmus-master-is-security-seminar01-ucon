'use client'
import { useEffect, useState } from 'react'
import { api, type Movie, type User } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import { captureAndSendGeo } from '@/lib/geo'
import Navbar from '@/components/Navbar'
import MovieCard from '@/components/MovieCard'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u) {
        router.push('/login')
        return
      }
      setUser(u)
      captureAndSendGeo()
      const ms = await api.movies.list().catch(() => [])
      setMovies(ms)
      setLoading(false)
    }
    init()
  }, [router])

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">Browse Movies</h1>
        {movies.length === 0 ? (
          <p className="text-gray-400">No movies available.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {movies.map(m => <MovieCard key={m.movie_id} movie={m} />)}
          </div>
        )}
      </main>
    </div>
  )
}
