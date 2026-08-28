import Link from 'next/link'
import type { Movie } from '@/lib/api'

export default function MovieCard({ movie }: { movie: Movie }) {
  return (
    <Link href={`/movies/${movie.movie_id}`}>
      <div className="bg-gray-800 rounded-lg p-4 hover:bg-gray-700 transition-colors cursor-pointer border border-gray-700">
        <div className="aspect-video bg-gray-700 rounded mb-3 flex items-center justify-center">
          <span className="text-4xl">🎬</span>
        </div>
        <h3 className="font-semibold text-white truncate">{movie.title}</h3>
        <p className="text-sm text-gray-400 mt-1">{movie.genre} · {movie.duration_minutes} min</p>
        {movie.geo_restriction.length > 0 && (
          <p className="text-xs text-yellow-500 mt-1">
            Regions: {movie.geo_restriction.join(', ')}
          </p>
        )}
        {!movie.is_available && (
          <p className="text-xs text-red-500 mt-1">Unavailable</p>
        )}
      </div>
    </Link>
  )
}
