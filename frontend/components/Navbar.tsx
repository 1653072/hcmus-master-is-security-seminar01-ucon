'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/auth'
import { type User } from '@/lib/api'

export default function Navbar({ user }: { user: User | null }) {
  const pathname = usePathname()
  if (!user) return null

  const linkClass = (href: string) =>
    pathname === href ? 'text-white font-semibold' : 'text-gray-300 hover:text-white'

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold text-purple-400">
        UCON Movies
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {user.role === 'user' && (
          <>
            <Link href="/" className={linkClass('/')}>Browse</Link>
            <Link href="/history" className={linkClass('/history')}>History</Link>
            {user.account_type === 'premium' && (
              <>
                <Link href="/offline" className={linkClass('/offline')}>Offline</Link>
                <Link href="/subscription" className={linkClass('/subscription')}>Subscription</Link>
              </>
            )}
            {user.account_type === 'basic' && (
              <Link href="/subscription" className={linkClass('/subscription')}>Upgrade</Link>
            )}
          </>
        )}
        {user.role === 'admin' && (
          <Link href="/admin" className={linkClass('/admin')}>Admin</Link>
        )}
        <Link href="/demo-panel" className={linkClass('/demo-panel')}>Control Panel</Link>
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
