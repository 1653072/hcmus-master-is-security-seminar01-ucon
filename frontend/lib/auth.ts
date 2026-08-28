'use client'
import { setToken, clearToken, api, type User } from './api'

export async function login(username: string, password: string): Promise<User> {
  const res = await api.auth.login({ username, password })
  setToken(res.token)
  return res.user
}

export async function register(data: {
  username: string
  password: string
  full_name: string
  gender: string
  account_type: string
}): Promise<User> {
  const res = await api.auth.register(data)
  setToken(res.token)
  return res.user
}

export function logout() {
  clearToken()
  window.location.href = '/login'
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await api.auth.me()
  } catch {
    clearToken()
    return null
  }
}
