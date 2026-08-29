const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ucon_token')
}

function setToken(token: string) {
  localStorage.setItem('ucon_token', token)
}

function clearToken() {
  localStorage.removeItem('ucon_token')
}

async function request<T>(
  path: string,
  options: RequestInit & { twoFA?: boolean } = {}
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.twoFA) headers['X-2FA-Code'] = 'MOCK_2FA_123456'

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw { status: res.status, ...data }
  return data as T
}

// Auth
export const api = {
  auth: {
    register: (body: {
      username: string
      password: string
      full_name: string
      gender: string
      account_type: string
    }) => request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify(body)
    }),

    login: (body: { username: string; password: string }) =>
      request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify(body)
      }),

    me: () => request<User>('/api/auth/me'),
  },

  movies: {
    list: () => request<Movie[]>('/api/movies'),
    get: (id: string) => request<Movie>(`/api/movies/${id}`),
  },

  geo: {
    save: (lat: number, lng: number) =>
      request<{ country_code: string }>('/api/users/location', {
        method: 'POST', body: JSON.stringify({ latitude: lat, longitude: lng })
      }),
  },

  rentals: {
    list: () => request<RentalWithMovie[]>('/api/rentals'),
    rent: (movie_id: string) =>
      request<{ rental: Rental }>('/api/rentals', {
        method: 'POST', body: JSON.stringify({ movie_id })
      }),
    play: (rental_id: string) =>
      request<PlayResponse>(`/api/rentals/${rental_id}/play`, { method: 'POST' }),
  },

  ads: {
    complete: (rental_id: string, ad_id: string, watch_duration_seconds: number) =>
      request<{ completed: boolean }>('/api/ads/complete', {
        method: 'POST',
        body: JSON.stringify({ rental_id, ad_id, watch_duration_seconds })
      }),
    streamUrl: (ad_id: string) => `${API_URL}/api/ads/${ad_id}/stream`,
  },

  sessions: {
    stop: (session_id: string) =>
      request<{ message: string }>(`/api/sessions/${session_id}/stop`, { method: 'POST' }),
    sseUrl: (session_id: string) => `${API_URL}/api/sessions/${session_id}/events`,
    streamUrl: (session_id: string) => `${API_URL}/api/stream/${session_id}`,
  },

  subscriptions: {
    get: () => request<Subscription>('/api/subscriptions/me'),
    subscribe: (months: number) =>
      request<{ subscription: Subscription }>('/api/subscriptions', {
        method: 'POST', body: JSON.stringify({ months })
      }),
    play: (movie_id: string) =>
      request<PlayResponse>(`/api/subscriptions/play/${movie_id}`, { method: 'POST' }),
  },

  offline: {
    list: () => request<OfflineDownloadWithMovie[]>('/api/offline'),
    download: (movie_id: string) =>
      request<{ download: OfflineDownload }>(`/api/offline/download/${movie_id}`, { method: 'POST' }),
    delete: (download_id: string) =>
      request<{ message: string }>(`/api/offline/${download_id}`, { method: 'DELETE' }),
  },

  history: {
    list: () => request<{ history: HistoryWithMovie[] }>('/api/history'),
  },

  admin: {
    movies: {
      list: () => request<Movie[]>('/api/admin/movies', { twoFA: true }),
      create: (body: Omit<Movie, 'movie_id' | 'created_at' | 'updated_at'> & { reason: string }) =>
        request<{ movie: Movie }>('/api/admin/movies', {
          method: 'POST', body: JSON.stringify(body), twoFA: true
        }),
      update: (id: string, body: Partial<Movie> & { reason: string }) =>
        request<{ movie: Movie }>(`/api/admin/movies/${id}`, {
          method: 'PUT', body: JSON.stringify(body), twoFA: true
        }),
      delete: (id: string, reason: string) =>
        request<{ message: string }>(`/api/admin/movies/${id}?reason=${encodeURIComponent(reason)}`, {
          method: 'DELETE', twoFA: true
        }),
    },
    auditLog: () => request<AuditLog[]>('/api/admin/audit-log', { twoFA: true }),
    users: () => request<UserSummary[]>('/api/admin/users', { twoFA: true }),
    blockUser: (id: string, reason: string) =>
      request<{ message: string }>(`/api/admin/users/${id}/block?reason=${encodeURIComponent(reason)}`, {
        method: 'PUT', twoFA: true
      }),
  },
}

export { getToken, setToken, clearToken }

// Types
export interface User {
  user_id: string
  username: string
  full_name: string
  gender: string
  role: string
  account_type: string | null
  offline_count: number
  copyright_consented_at: string | null
  offline_consent_at: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface Movie {
  movie_id: string
  title: string
  genre: string
  duration_minutes: number
  geo_restriction: string[]
  is_available: boolean
  video_file: string
  created_at: string
  updated_at: string
}

export interface Rental {
  rental_id: string
  user_id: string
  movie_id: string
  rental_views_remaining: number
  rental_expiry: string
  created_at: string
}

export interface RentalWithMovie extends Rental {
  movie_title: string
  movie_genre: string
  movie_duration_minutes: number
}

export interface Subscription {
  subscription_id: string
  user_id: string
  subscription_expiry: string
  active_device_count: number
  created_at: string
  updated_at: string
}

export interface PlayResponse {
  session_id: string
  video_stream_url: string
  sse_url: string
  ucon: string[]
  views_remaining?: number
}

export interface AdObligation {
  error: string
  ucon: string
  obligation: string
  ad_id: string
  ad_title: string
  ad_stream_url: string
  ad_duration_seconds: number
}

export interface OfflineDownload {
  download_id: string
  user_id: string
  movie_id: string
  downloaded_at: string
  status: string
  created_at: string
}

export interface OfflineDownloadWithMovie extends OfflineDownload {
  movie_title: string
  movie_genre: string
  movie_duration_minutes: number
}

export interface WatchHistory {
  history_id: string
  user_id: string
  movie_id: string
  watch_start: string
  watch_end: string
  device_info: string
  created_at: string
}

export interface HistoryWithMovie extends WatchHistory {
  movie_title: string
  movie_genre: string
  movie_duration_minutes: number
}

export interface AuditLog {
  log_id: string
  admin_id: string
  action: string
  target_type: string
  target_id: string
  reason: string
  created_at: string
  admin_username: string
}

export interface UserSummary {
  user_id: string
  username: string
  full_name: string
  gender: string
  role: string
  account_type: string | null
  offline_count: number
  status: string
}
