'use client'

import { BackLink } from '@/components/shared/back-link'

/**
 * The layout every tool page uses (spec section 37): a title that says what
 * the tool does, then numbered steps, then the result.
 *
 * It lives here rather than being written out on each page so that merge,
 * split and the eight tools after them stay recognisably the same screen.
 */
export function ToolShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard/tools">All tools</BackLink>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      {children}
    </div>
  )
}

/**
 * One numbered step.
 *
 * The number is decoration, so it is hidden from screen readers: the heading
 * already says what the step is, and "1 Choose your PDFs" read aloud is worse
 * than "Choose your PDFs".
 */
export function ToolStep({
  step,
  title,
  description,
  children,
}: {
  step: number
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          aria-hidden
        >
          {step}
        </span>
        <div>
          <h2 className="font-medium tracking-tight">{title}</h2>
          {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
        </div>
      </div>

      <div className="pl-9">{children}</div>
    </section>
  )
}
