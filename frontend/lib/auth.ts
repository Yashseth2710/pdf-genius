import { apiFetch } from '@/lib/api'
import type { AuthPayload, LoginInput, RegisterInput, User } from '@/types/api'

const TOKEN_KEY = 'pdf-genius.token'

/**
 * Where the access token lives.
 *
 * localStorage, because the API is on a different origin and the token travels
 * as an Authorization header. This is honest about its limits: a script running
 * on the page could read it, exactly as it could read a non-httpOnly cookie.
 * Moving to an httpOnly cookie set by a small Next route handler is the
 * hardening step planned for scope 11 — see docs/SECURITY.md.
 */
export const tokenStore = {
  get(): string | null {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(TOKEN_KEY)
  },
  set(token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token)
  },
  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY)
  },
}

function authHeader(): Record<string, string> {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function register(input: RegisterInput): Promise<AuthPayload> {
  return apiFetch<AuthPayload>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function login(input: LoginInput): Promise<AuthPayload> {
  return apiFetch<AuthPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me', { headers: authHeader() })
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST', headers: authHeader() })
  } catch {
    // Signing out must always succeed locally. If the request fails - offline,
    // token already expired - the token still gets discarded below.
  } finally {
    tokenStore.clear()
  }
}
