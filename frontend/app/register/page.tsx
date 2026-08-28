'use client'
import { useState } from 'react'
import { register } from '@/lib/auth'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: '', password: '', full_name: '', gender: 'unknown', account_type: 'basic'
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await register(form)
      router.push('/')
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setError(e.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-8 rounded-xl w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>
        {error && <p className="text-red-400 text-sm mb-4 bg-red-900/30 p-3 rounded">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name</label>
            <input type="text" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
              required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input type="text" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
              required minLength={3} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
              required minLength={8} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Gender</label>
            <select value={form.gender}
              onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none">
              <option value="unknown">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Account Type</label>
            <select value={form.account_type}
              onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}
              className="w-full bg-gray-800 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none">
              <option value="basic">Basic — Pay-per-rental (₫45,000/movie)</option>
              <option value="premium">Premium — Monthly subscription (₫99,000/month)</option>
            </select>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 py-2 rounded font-medium transition-colors">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm text-gray-400">
          Have an account?{' '}
          <Link href="/login" className="text-purple-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
