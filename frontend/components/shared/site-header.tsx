'use client'

import Link from 'next/link'

import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { UserMenu } from '@/components/shared/user-menu'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

/**
 * The one header, in both states. Signed out it sells the product; signed in it
 * gets out of the way and hands over to the account menu.
 */
export function SiteHeader() {
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <header className="bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href={isAuthenticated ? '/dashboard' : '/'} />

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <ThemeToggle />

          {isLoading ? (
            // A fixed-width placeholder, so the header does not jump once the
            // session resolves.
            <div className="bg-muted h-9 w-24 animate-pulse rounded-md" aria-hidden />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <>
              {/* Links, not buttons: they navigate. */}
              <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                Sign in
              </Link>
              <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
