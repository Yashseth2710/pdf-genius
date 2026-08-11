'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { useAuth } from '@/hooks/use-auth'

/**
 * Keeps signed-out visitors out of the app.
 *
 * The check runs in the browser because the token is not readable on the
 * server. Next's own docs describe proxy-based checks as optimistic only, so
 * the real gate is the API: every protected endpoint verifies the token
 * itself, and this component just avoids showing a shell that cannot load.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[60vh] items-center justify-center"
      >
        <span className="text-muted-foreground text-sm">Loading your workspace…</span>
      </div>
    )
  }

  // Render nothing while the redirect above is in flight, rather than flashing
  // the app to someone who is not signed in.
  if (!isAuthenticated) return null

  return <>{children}</>
}
