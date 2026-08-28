'use client'
import { useState } from 'react'
import { login } from '@/lib/auth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(form.username, form.password)
      router.push('/')
    } catch (err: unknown) {
      const e = err as { error?: string }
      setError(e.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign In</h1>
        <p className="text-xs text-gray-500 mb-6 text-center">
          Demo: basic_demo / premium_demo / admin_demo — Password: Password123!
        </p>
        {error && <p className="text-red-400 text-sm mb-4 bg-red-900/30 p-3 rounded">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-2 rounded font-medium transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm text-gray-400">
          No account? <Link href="/register" className="text-purple-400 hover:underline">Register</Link>
        </p>
      </div>
    </div>
  )
}
