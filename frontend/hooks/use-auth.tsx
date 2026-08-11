'use client'

import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError } from '@/lib/api'
import * as authApi from '@/lib/auth'
import type { AuthPayload, LoginInput, RegisterInput, User } from '@/types/api'

interface AuthContextValue {
  user: User | null
  /** True until the stored token has been checked, so guards can wait. */
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (input: LoginInput) => Promise<void>
  signUp: (input: RegisterInput) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On first load, a token in storage is only a claim. Ask the API who it
  // belongs to; if it has expired or been revoked, drop it.
  useEffect(() => {
    let active = true

    async function restoreSession() {
      if (!authApi.tokenStore.get()) {
        if (active) setIsLoading(false)
        return
      }
      try {
        const currentUser = await authApi.fetchCurrentUser()
        if (active) setUser(currentUser)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          authApi.tokenStore.clear()
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  const accept = useCallback((payload: AuthPayload) => {
    authApi.tokenStore.set(payload.access_token)
    setUser(payload.user)
  }, [])

  const signIn = useCallback(
    async (input: LoginInput) => accept(await authApi.login(input)),
    [accept],
  )

  const signUp = useCallback(
    async (input: RegisterInput) => accept(await authApi.register(input)),
    [accept],
  )

  const signOut = useCallback(async () => {
    // Deliberately does not navigate. On a protected page, RequireAuth sees the
    // session disappear and sends the user to /login; navigating here as well
    // meant two redirects racing, and which one won was down to timing.
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn,
      signUp,
      signOut,
    }),
    [user, isLoading, signIn, signUp, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return context
}
