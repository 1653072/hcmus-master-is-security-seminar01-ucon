'use client'
import Link from 'next/link'
import { logout } from '@/lib/auth'
import { type User } from '@/lib/api'

export default function Navbar({ user }: { user: User | null }) {
  if (!user) return null

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-purple-400">
        UCON Movies
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {user.role === 'user' && (
          <>
            <Link href="/" className="text-gray-300 hover:text-white">Browse</Link>
            <Link href="/history" className="text-gray-300 hover:text-white">History</Link>
            {user.account_type === 'premium' && (
              <>
                <Link href="/offline" className="text-gray-300 hover:text-white">Offline</Link>
                <Link href="/subscription" className="text-gray-300 hover:text-white">Subscription</Link>
              </>
            )}
            {user.account_type === 'basic' && (
              <Link href="/subscription" className="text-gray-300 hover:text-white">Upgrade</Link>
            )}
          </>
        )}
        {user.role === 'admin' && (
          <Link href="/admin" className="text-gray-300 hover:text-white">Admin</Link>
        )}
        <span className="text-gray-500">|</span>
        <span className="text-gray-400">
          {user.username}
          {user.account_type && (
            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
              user.account_type === 'premium' ? 'bg-yellow-600 text-yellow-100' : 'bg-gray-600 text-gray-200'
            }`}>
              {user.account_type}
            </span>
          )}
          {user.role === 'admin' && (
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-red-700 text-red-100">admin</span>
          )}
        </span>
        <button onClick={logout} className="text-gray-400 hover:text-red-400">Logout</button>
      </div>
    </nav>
  )
}
