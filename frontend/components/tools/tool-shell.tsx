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
    <div className="space-y-10">
      <div>
        <BackLink href="/dashboard/tools">All tools</BackLink>
        <h1 className="text-3xl">{title}</h1>
        <p className="text-muted-foreground mt-2">{description}</p>
      </div>

      {children}
    </div>
  )
}

/**
 * One numbered step.
 *
 * The number hangs in the left margin as plain mono type rather than sitting in
 * a tinted circle. These steps are genuinely sequential — you cannot split a
 * PDF before choosing one — so the numbers are doing real work, but a coloured
 * pill around each one is furniture, and at four steps down a page it is a
 * column of furniture.
 *
 * It is hidden from screen readers: the heading already says what the step is,
 * and "1 Choose your PDFs" read aloud is worse than "Choose your PDFs".
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
    <section className="sm:grid sm:grid-cols-[2rem_1fr] sm:gap-x-4">
      <span
        className="text-muted-foreground hidden font-mono text-sm leading-7 sm:block"
        aria-hidden
      >
        {step}.
      </span>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl">{title}</h2>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}
