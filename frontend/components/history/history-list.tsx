'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Combine,
  FileOutput,
  LayoutGrid,
  Loader2,
  Minimize2,
  Scissors,
  Trash2,
  XCircle,
} from 'lucide-react'
import Link from '@/components/shared/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { formatExactly, formatWhen } from '@/lib/format'
import { describeJob, operationLabel } from '@/lib/job-summary'
import { deleteJob, listJobs } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import type { Job, JobFilters, JobStatus, OperationType } from '@/types/api'

const PAGE_SIZE = 20

/** Only the operations this app can actually produce. */
const OPERATIONS: { value: OperationType; label: string }[] = [
  { value: 'MERGE', label: 'Merge' },
  { value: 'SPLIT', label: 'Split' },
  { value: 'ORGANISE', label: 'Organise' },
  { value: 'COMPRESS', label: 'Compress' },
  { value: 'CONVERT', label: 'Convert' },
]

const STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PROCESSING', label: 'Processing' },
]

/**
 * The filter controls, styled to match the app's inputs.
 *
 * Native `<select>` and `<input type="date">` rather than custom widgets: both
 * are fully keyboard accessible for free, and on a phone both open the
 * platform's own picker, which is better than anything worth building here.
 * They only needed to stop looking like they came from a different app.
 */
const CONTROL =
  'border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 rounded-lg border bg-transparent px-2 text-sm transition-colors outline-none focus-visible:ring-3'

const ICONS: Partial<Record<OperationType, typeof Combine>> = {
  MERGE: Combine,
  SPLIT: Scissors,
  ORGANISE: LayoutGrid,
  COMPRESS: Minimize2,
  CONVERT: FileOutput,
}

export function HistoryList() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<JobFilters>({})
  const [offset, setOffset] = useState(0)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['jobs', filters, offset],
    queryFn: () => listJobs(filters, PAGE_SIZE, offset),
  })

  const removal = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success('Removed from your history')
    },
    onError: (failure: unknown) => {
      toast.error(
        failure instanceof ApiError ? failure.message : 'That entry could not be removed.',
      )
    },
  })

  /** Changing a filter goes back to page one; page 3 of the old result is meaningless. */
  function narrow(next: JobFilters) {
    setFilters(next)
    setOffset(0)
  }

  const isFiltered = Object.values(filters).some(Boolean)

  return (
    <div className="space-y-4">
      <Filters value={filters} onChange={narrow} />

      {isPending ? (
        <ul className="border-t" aria-busy="true" aria-label="Loading your history">
          {[0, 1, 2].map((row) => (
            <li key={row} className="border-b px-3 py-3">
              <div className="bg-muted h-4 w-64 max-w-full animate-pulse rounded" />
              <div className="bg-muted mt-2 h-3 w-32 animate-pulse rounded" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-dashed px-6 py-10">
          <p className="font-medium">Could not load your history</p>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">
            {error instanceof ApiError ? error.message : 'Something went wrong.'}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : data.items.length === 0 ? (
        <Empty isFiltered={isFiltered} onClear={() => narrow({})} />
      ) : (
        <>
          <ul className="border-t">
            {data.items.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                onDelete={() => removal.mutate(job.id)}
                isDeleting={removal.isPending && removal.variables === job.id}
              />
            ))}
          </ul>

          {data.total > PAGE_SIZE && (
            <nav className="flex items-center justify-between" aria-label="Pagination">
              <p className="text-muted-foreground tabular text-sm">
                Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(data.total / PAGE_SIZE)},{' '}
                {data.total} entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= data.total}
                  onClick={() => setOffset((current) => current + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

function Filters({ value, onChange }: { value: JobFilters; onChange: (next: JobFilters) => void }) {
  const isFiltered = Object.values(value).some(Boolean)

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <Field label="Tool" htmlFor="filter-operation">
        <select
          id="filter-operation"
          className={CONTROL}
          value={value.operation ?? ''}
          onChange={(event) =>
            onChange({ ...value, operation: (event.target.value || undefined) as OperationType })
          }
        >
          <option value="">Any tool</option>
          {OPERATIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Result" htmlFor="filter-status">
        <select
          id="filter-status"
          className={CONTROL}
          value={value.status ?? ''}
          onChange={(event) =>
            onChange({ ...value, status: (event.target.value || undefined) as JobStatus })
          }
        >
          <option value="">Any result</option>
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="From" htmlFor="filter-from">
        <input
          id="filter-from"
          type="date"
          className={CONTROL}
          value={value.date_from ?? ''}
          onChange={(event) => onChange({ ...value, date_from: event.target.value || undefined })}
        />
      </Field>

      <Field label="To" htmlFor="filter-to">
        <input
          id="filter-to"
          type="date"
          className={CONTROL}
          value={value.date_to ?? ''}
          onChange={(event) => onChange({ ...value, date_to: event.target.value || undefined })}
        />
      </Field>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-muted-foreground block text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function JobRow({
  job,
  onDelete,
  isDeleting,
}: {
  job: Job
  onDelete: () => void
  isDeleting: boolean
}) {
  const Icon = ICONS[job.operation] ?? Combine
  const failed = job.status === 'FAILED'
  const running = job.status === 'PROCESSING' || job.status === 'QUEUED'

  return (
    <li className="flex items-center gap-3 border-b px-3 py-3">
      {/* The icon says which tool ran and takes its colour from whether the run
          worked. That is one signal in one place, instead of a tinted tile on
          the left and a coloured chip on the right both reporting the same
          thing on every row of the list. */}
      <Icon
        className={cn('size-4 shrink-0', failed ? 'text-destructive' : 'text-muted-foreground')}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {operationLabel(job.operation)} {describeJob(job)}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          {/* The exact time is a title rather than the label: "4 minutes ago"
              is what someone wants at a glance, and the timestamp is there for
              anyone who needs to be precise. */}
          <span className="tabular" title={formatExactly(job.created_at)}>
            {formatWhen(job.created_at)}
          </span>
          {failed && (
            <span className="text-destructive inline-flex items-center gap-1">
              <XCircle className="size-3" aria-hidden />
              {job.error_message ?? 'Failed'}
            </span>
          )}
          {running && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Still running
            </span>
          )}
          {/* Completed stays on the row, but plainly. A green tick beside every
              entry in a list where almost everything succeeds is decoration:
              it is the exceptions that need marking. */}
          {!failed && !running && <span>Completed</span>}
        </p>
      </div>

      {job.output_document_ids.length > 0 && (
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
        >
          {job.output_document_ids.length === 1
            ? 'See the file'
            : `See ${job.output_document_ids.length} files`}
        </Link>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-muted-foreground hover:text-destructive"
            />
          }
          aria-label={`Remove this ${operationLabel(job.operation).toLowerCase()} entry`}
        >
          {isDeleting ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
        </TooltipTrigger>
        {/* Says what survives, because "delete" next to a list of files you
            made is a genuinely frightening button. */}
        <TooltipContent>Removes the entry. Your files are kept.</TooltipContent>
      </Tooltip>
    </li>
  )
}

function Empty({ isFiltered, onClear }: { isFiltered: boolean; onClear: () => void }) {
  // Two different situations that look identical if you only check for zero
  // rows: an account that has never run anything, and a filter that matched
  // nothing. Telling someone to "use a tool" when they have used five is the
  // sort of thing that makes an app feel like it is not paying attention.
  if (isFiltered) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12">
        <h3 className="text-lg">Nothing matches those filters</h3>
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">
          There is history here, just not of this kind.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-dashed px-6 py-12">
      <h3 className="text-lg">Nothing here yet</h3>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">
        Every merge, split, compression and conversion you run shows up here.
      </p>
      <Link
        href="/dashboard/tools"
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
      >
        Try a tool
      </Link>
    </div>
  )
}
