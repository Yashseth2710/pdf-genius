import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The way back up one level.
 *
 * Every screen below the dashboard carries one, in the same place and the same
 * shape, so the way out is somewhere people can learn rather than something
 * they have to hunt for on each page. The browser's own back button is not
 * enough: someone who arrived by clicking through three tools has no idea how
 * many presses it takes to get home.
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-3 -ml-2', className)}
    >
      <ArrowLeft aria-hidden />
      {children}
    </Link>
  )
}
