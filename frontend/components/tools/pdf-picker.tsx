'use client'

import { FileText } from 'lucide-react'
import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ApiError } from '@/lib/api'
import { formatBytes, formatPages } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

/**
 * The loading, empty and error states every picker shares.
 *
 * A plain function rather than a component, and deliberately lowercase: the
 * caller needs to know whether there is a placeholder at all, and a JSX
 * element is always truthy, so `<Placeholder />` could never answer that.
 */
function pickerPlaceholder({
  isPending,
  isError,
  error,
  isEmpty,
  hasOnlyNonPdfs,
  onRetry,
}: {
  isPending: boolean
  isError: boolean
  error: unknown
  isEmpty: boolean
  hasOnlyNonPdfs: boolean
  onRetry: () => void
}): React.ReactNode | null {
  if (isPending) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading your PDFs">
        {[0, 1, 2].map((row) => (
          <li key={row} className="bg-muted/50 h-[58px] animate-pulse rounded-lg" />
        ))}
      </ul>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-dashed px-6 py-8 text-center">
        <p className="font-medium">Could not load your documents</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'Something went wrong.'}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-10 text-center">
        <p className="font-medium">{hasOnlyNonPdfs ? 'No PDFs yet' : 'Nothing to work with yet'}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasOnlyNonPdfs
            ? 'These tools work on PDFs, and none of your documents is one.'
            : 'Upload a PDF and it will show up here.'}
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
        >
          Upload a PDF
        </Link>
      </div>
    )
  }

  return null
}

interface PickerProps {
  documents: DocumentSummary[]
  isPending: boolean
  isError: boolean
  error: unknown
  hasOnlyNonPdfs: boolean
  onRetry: () => void
}

function meta(document: DocumentSummary): string {
  const pages = formatPages(document.page_count)
  return `${formatBytes(document.file_size)}${pages ? ` · ${pages}` : ''}`
}

/** Choose exactly one PDF. */
export function PdfSingleSelect({
  value,
  onChange,
  ...state
}: PickerProps & { value: string | null; onChange: (id: string) => void }) {
  const placeholder = pickerPlaceholder({ ...state, isEmpty: state.documents.length === 0 })
  if (placeholder !== null) return placeholder

  return (
    <RadioGroup
      value={value ?? undefined}
      onValueChange={(next) => onChange(String(next))}
      aria-label="Choose a PDF"
    >
      {state.documents.map((document) => (
        <label
          key={document.id}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
            value === document.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
          )}
        >
          <RadioGroupItem value={document.id} />
          <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{document.original_filename}</span>
            <span className="text-muted-foreground block text-xs">{meta(document)}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}

/**
 * Choose any number of PDFs.
 *
 * Ticking a file appends it to the selection rather than inserting it by list
 * position, so the order the user builds up is the order they get.
 */
export function PdfMultiSelect({
  selected,
  onToggle,
  ...state
}: PickerProps & { selected: string[]; onToggle: (id: string) => void }) {
  const placeholder = pickerPlaceholder({ ...state, isEmpty: state.documents.length === 0 })
  if (placeholder !== null) return placeholder

  return (
    <ul className="space-y-2">
      {state.documents.map((document) => {
        const isSelected = selected.includes(document.id)
        return (
          <li key={document.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
              )}
            >
              {/* No aria-label here: the whole row is the checkbox's label,
                  so Base UI points aria-labelledby at it and any aria-label
                  we set would be ignored. The name is the filename and its
                  size, which is what a user is choosing between anyway. */}
              <Checkbox checked={isSelected} onCheckedChange={() => onToggle(document.id)} />
              <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {document.original_filename}
                </span>
                <span className="text-muted-foreground block text-xs">{meta(document)}</span>
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}
