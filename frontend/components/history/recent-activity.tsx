'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import Link from '@/components/shared/link'

import { buttonVariants } from '@/components/ui/button'
import { formatExactly, formatWhen } from '@/lib/format'
import { describeJob, operationLabel } from '@/lib/job-summary'
import { listJobs } from '@/lib/jobs'
import { cn } from '@/lib/utils'

/** Enough to show what you were doing, few enough to stay a glance. */
const RECENT = 5

/**
 * The last few things you did, on the dashboard.
 *
 * Deliberately not the history screen in miniature: no filters, no pagination,
 * no delete. It answers "where was I" and hands over to the full screen for
 * anything more. A second, slightly different history would be two things to
 * keep working and one more place for them to disagree.
 */
export function RecentActivity() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['jobs', {}, 0, RECENT],
    queryFn: () => listJobs({}, RECENT, 0),
  })

  // Quiet on failure. This is a secondary panel on a page whose real job is
  // uploading and listing documents, and an alarming red box here would say
  // the dashboard is broken when it is not.
  if (isError) return null

  if (isPending) {
    return (
      <section className="space-y-3">
        <h2 className="text-xl">Recent activity</h2>
        <ul className="space-y-2" aria-busy="true" aria-label="Loading recent activity">
          {[0, 1].map((row) => (
            <li key={row} className="bg-muted/50 h-[52px] animate-pulse rounded-lg" />
          ))}
        </ul>
      </section>
    )
  }

  // Nothing at all rather than an empty panel: a brand-new account has enough
  // to read on this page already, and "no activity yet" under a heading called
  // "Recent activity" is a box that exists only to say it is empty.
  if (data.items.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl">Recent activity</h2>
        <Link
          href="/dashboard/history"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          All history
          <ArrowRight aria-hidden />
        </Link>
      </div>

      {/* Ruled rows rather than five stacked bordered boxes. A box around every
          line of a list is depth that says nothing: the rows are siblings, and
          a hairline between them says so more quietly. */}
      <ul className="border-t">
        {data.items.map((job) => (
          <li
            key={job.id}
            className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm"
          >
            <p className="min-w-0 truncate">
              <span className="font-medium">{operationLabel(job.operation)}</span>{' '}
              <span className="text-muted-foreground">{describeJob(job)}</span>
            </p>
            <span
              className="text-muted-foreground tabular shrink-0 text-xs"
              title={formatExactly(job.created_at)}
            >
              {formatWhen(job.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
