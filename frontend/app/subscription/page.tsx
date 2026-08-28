'use client'
import { useEffect, useState } from 'react'
import { api, type User, type Subscription } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

export default function SubscriptionPage() {
  const [user, setUser] = useState<User | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState(1)
  const [purchasing, setPurchasing] = useState(false)
  const [msg, setMsg] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u) { router.push('/login'); return }
      setUser(u)
      const sub = await api.subscriptions.get().catch(() => null)
      setSubscription(sub)
      setLoading(false)
    }
    init()
  }, [router])

  const handleSubscribe = async () => {
    setPurchasing(true)
    setMsg('')
    try {
      const res = await api.subscriptions.subscribe(months)
      setSubscription(res.subscription)
      setMsg(`Subscription activated until ${new Date(res.subscription.subscription_expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`)
      // Refresh user
      const u = await getCurrentUser()
      setUser(u)
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setMsg('Failed: ' + (e.error || 'Unknown error'))
    } finally {
      setPurchasing(false)
    }
  }

  const isActive = subscription && new Date(subscription.subscription_expiry) > new Date()
  const price = 99000

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Subscription</h1>

        {isActive && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-300 font-semibold">✓ Active Premium Subscription</p>
            <p className="text-sm text-gray-300 mt-1">
              Expires: {new Date(subscription!.subscription_expiry).toLocaleString()}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Active devices: {subscription!.active_device_count}/3
              <span className="ml-2 text-xs text-gray-500">(UCON preA1 — max 3 concurrent streams)</span>
            </p>
          </div>
        )}

        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-2">
            {isActive ? 'Extend Subscription' : 'Subscribe to Premium'}
          </h2>
          <div className="text-sm text-gray-400 mb-4 space-y-1">
            <p>✓ Unlimited movie streaming</p>
            <p>✓ No pre-roll advertisements</p>
            <p>✓ Offline download (up to 5 movies)</p>
            <p>✓ Up to 3 devices simultaneously</p>
          </div>

          <div className="mb-4 p-3 bg-gray-900 rounded text-xs text-gray-500 space-y-1">
            <p><strong className="text-purple-400">UCON preB1:</strong> Mock payment — transaction recorded for audit.</p>
            <p><strong className="text-purple-400">UCON preA1:</strong> subscription_expiry extended atomically.</p>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <label className="text-sm text-gray-400 whitespace-nowrap">Duration:</label>
            <select value={months} onChange={e => setMonths(parseInt(e.target.value))}
              className="bg-gray-700 rounded px-3 py-2 text-white border border-gray-600 flex-1">
              {[1, 3, 6, 12].map(m => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? 's' : ''} — ₫{(price * m).toLocaleString('vi-VN')}
                  {m >= 3 ? ` (₫${price.toLocaleString()}/month)` : ''}
                </option>
              ))}
            </select>
          </div>

          {msg && (
            <div className={`mb-4 p-3 rounded text-sm border ${
              msg.startsWith('Failed')
                ? 'bg-red-900/30 border-red-700 text-red-300'
                : 'bg-green-900/30 border-green-700 text-green-300'
            }`}>
              {msg}
            </div>
          )}

          <button onClick={handleSubscribe} disabled={purchasing}
            className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 px-8 py-3 rounded font-medium transition-colors w-full sm:w-auto">
            {purchasing ? 'Processing...' : `Confirm Payment — ₫${(price * months).toLocaleString('vi-VN')}`}
          </button>
          <p className="text-xs text-gray-600 mt-2">
            Mock payment: always succeeds. Real transaction recorded in payment_transactions table.
          </p>
        </div>
      </main>
    </div>
  )
}
