'use client'
import { useEffect, useState } from 'react'
import { api, type User, type Movie, type AuditLog, type UserSummary } from '@/lib/api'
import { getCurrentUser } from '@/lib/auth'
import Navbar from '@/components/Navbar'
import { useRouter } from 'next/navigation'

type Tab = 'movies' | 'audit' | 'users'

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null)
  const [movies, setMovies] = useState<Movie[]>([])
  const [auditLog, setAuditLog] = useState<AuditLog[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [tab, setTab] = useState<Tab>('movies')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    title: '', genre: '', duration_minutes: '10',
    geo_restriction: '', is_available: true, video_file: '', reason: ''
  })
  const router = useRouter()

  const refreshData = async () => {
    const [ms, logs, us] = await Promise.all([
      api.admin.movies.list().catch(() => []),
      api.admin.auditLog().catch(() => []),
      api.admin.users().catch(() => []),
    ])
    setMovies(ms)
    setAuditLog(logs)
    setUsers(us)
  }

  useEffect(() => {
    async function init() {
      const u = await getCurrentUser()
      if (!u || u.role !== 'admin') { router.push('/login'); return }
      setUser(u)
      await refreshData()
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const handleCreateMovie = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    try {
      const geoRestriction = form.geo_restriction
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(s => s.length === 2)

      await api.admin.movies.create({
        title: form.title,
        genre: form.genre,
        duration_minutes: parseInt(form.duration_minutes) || 10,
        geo_restriction: geoRestriction,
        is_available: form.is_available,
        video_file: form.video_file,
        reason: form.reason,
      })
      setMsg('Movie created! Audit log entry recorded (onA3).')
      setForm({ title: '', genre: '', duration_minutes: '10', geo_restriction: '', is_available: true, video_file: '', reason: '' })
      await refreshData()
    } catch (err: unknown) {
      const e = err as Record<string, string>
      setMsg('Error: ' + (e.error || 'Failed to create'))
    }
  }

  const handleDeactivate = async (id: string, title: string) => {
    const reason = window.prompt(`Reason for deactivating "${title}"?`)
    if (!reason) return
    try {
      await api.admin.movies.delete(id, reason)
      await refreshData()
    } catch (err: unknown) {
      const e = err as Record<string, string>
      alert('Failed: ' + (e.error || ''))
    }
  }

  const handleBlockUser = async (id: string, username: string) => {
    const reason = window.prompt(`Reason for blocking "${username}"?`)
    if (!reason) return
    try {
      await api.admin.blockUser(id, reason)
      await refreshData()
    } catch (err: unknown) {
      const e = err as Record<string, string>
      alert('Failed: ' + (e.error || ''))
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>

  return (
    <div>
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold">Admin Console</h1>
          <div className="text-xs bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded">
            <strong>UCON:</strong> preA0 (role=admin) + preB1 (X-2FA-Code header sent automatically) + onA3 (audit_log)
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {(['movies', 'audit', 'users'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                tab === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'movies' && <span className="ml-1 text-xs opacity-70">({movies.length})</span>}
              {t === 'audit' && <span className="ml-1 text-xs opacity-70">({auditLog.length})</span>}
              {t === 'users' && <span className="ml-1 text-xs opacity-70">({users.length})</span>}
            </button>
          ))}
        </div>

        {tab === 'movies' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4">Add Movie</h2>
              {msg && (
                <div className={`mb-4 text-sm p-3 rounded border ${
                  msg.startsWith('Error')
                    ? 'bg-red-900/30 border-red-700 text-red-300'
                    : 'bg-green-900/30 border-green-700 text-green-300'
                }`}>{msg}</div>
              )}
              <form onSubmit={handleCreateMovie} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  ['title', 'Title', 'text', true],
                  ['genre', 'Genre', 'text', true],
                  ['duration_minutes', 'Duration (minutes)', 'number', true],
                  ['video_file', 'Video Filename (e.g. my_movie.mp4)', 'text', true],
                  ['geo_restriction', 'Geo Restriction (e.g. VN,US — empty = global)', 'text', false],
                  ['reason', 'Reason for adding (audit log)', 'text', true],
                ] as [string, string, string, boolean][]).map(([field, label, type, req]) => (
                  <div key={field}>
                    <label className="block text-sm text-gray-400 mb-1">{label}</label>
                    <input type={type} value={(form as Record<string, unknown>)[field] as string}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full bg-gray-700 rounded px-3 py-2 text-white border border-gray-600 focus:border-purple-500 outline-none"
                      required={req} min={type === 'number' ? '1' : undefined} />
                  </div>
                ))}
                <div className="flex items-center gap-3 col-span-full">
                  <input type="checkbox" id="is_available" checked={form.is_available}
                    onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))}
                    className="w-4 h-4" />
                  <label htmlFor="is_available" className="text-sm text-gray-400">Available immediately</label>
                </div>
                <div className="col-span-full">
                  <button type="submit"
                    className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded font-medium transition-colors">
                    Add Movie (onA3 audit)
                  </button>
                </div>
              </form>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-3">All Movies</h2>
              <div className="space-y-2">
                {movies.map(m => (
                  <div key={m.movie_id}
                    className="bg-gray-800 rounded p-3 border border-gray-700 flex items-center justify-between">
                    <div className="text-sm flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.title}</span>
                      <span className="text-gray-400">{m.genre} · {m.duration_minutes}min</span>
                      {m.geo_restriction.length > 0 && (
                        <span className="text-yellow-500 text-xs">[{m.geo_restriction.join(',')}]</span>
                      )}
                      {!m.is_available && (
                        <span className="text-red-400 text-xs bg-red-900/30 px-2 py-0.5 rounded">inactive</span>
                      )}
                    </div>
                    {m.is_available && (
                      <button onClick={() => handleDeactivate(m.movie_id, m.title)}
                        className="text-red-400 hover:text-red-300 text-sm ml-4 flex-shrink-0">
                        Deactivate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Audit Log (last 100 entries)</h2>
            <p className="text-xs text-gray-500 mb-4">Append-only — no UPDATE/DELETE allowed. onA3 writes after every admin action.</p>
            <div className="space-y-2">
              {auditLog.length === 0 && <p className="text-gray-400">No audit entries yet.</p>}
              {auditLog.map(l => (
                <div key={l.log_id} className="bg-gray-800 rounded p-3 border border-gray-700 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-purple-400 font-medium">{l.action}</span>
                    <span className="text-gray-400">on {l.target_type}: {l.target_id.slice(0, 8)}...</span>
                    <span className="text-gray-500">by <strong>{l.admin_username}</strong></span>
                    {l.reason && <span className="text-gray-400">— {l.reason}</span>}
                    <span className="text-gray-600 text-xs ml-auto">{new Date(l.created_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Users</h2>
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.user_id}
                  className="bg-gray-800 rounded p-3 border border-gray-700 flex items-center justify-between">
                  <div className="text-sm flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.username}</span>
                    <span className="text-gray-400">{u.full_name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      u.status === 'active' ? 'bg-green-800 text-green-200'
                      : u.status === 'blocked' ? 'bg-red-800 text-red-200'
                      : 'bg-gray-700 text-gray-300'
                    }`}>{u.status}</span>
                    <span className="text-gray-500 text-xs">{u.role}{u.account_type ? `/${u.account_type}` : ''}</span>
                    <span className="text-gray-600 text-xs">offline: {u.offline_count}/5</span>
                  </div>
                  {u.status === 'active' && u.role !== 'admin' && (
                    <button onClick={() => handleBlockUser(u.user_id, u.username)}
                      className="text-red-400 hover:text-red-300 text-sm ml-4 flex-shrink-0">
                      Block
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
