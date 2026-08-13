'use client'

import Link from 'next/link'

import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { UserMenu } from '@/components/shared/user-menu'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

/**
 * The one header, in both states. Signed out it sells the product; signed in it
 * gets out of the way and hands over to the account menu.
 */
export function SiteHeader() {
  const { isAuthenticated, isLoading } = useAuth()

  return (
    // Opaque, not a frosted pane. Blur behind a bar is a real technique for a
    // real problem — content that must stay legible while it scrolls under —
    // and this bar has a solid background and a hairline under it, so the blur
    // was only ever there for the look of it.
    <header className="bg-background sticky top-0 z-40 w-full border-b">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6 sm:px-8">
        <Logo href={isAuthenticated ? '/dashboard' : '/'} />

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {isAuthenticated && (
            <>
              <Link
                href="/dashboard/tools"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
              >
                Tools
              </Link>
              <Link
                href="/dashboard/history"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
              >
                History
              </Link>
            </>
          )}

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
              <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                Sign in
              </Link>
              {/* "Sign up", not "Get started". It pairs with "Sign in" beside
                  it and it names the thing that happens when you click it. */}
              <Link href="/register" className={cn(buttonVariants({ size: 'sm' }))}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
