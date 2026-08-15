'use client'

import { FileText, Image as ImageIcon, Plus } from 'lucide-react'
import Link from '@/components/shared/link'

import { PreviewButton } from '@/components/tools/preview-button'
import { canPreviewInBrowser } from '@/components/tools/use-documents'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ApiError } from '@/lib/api'
import { formatBytes, formatPages } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

/**
 * What a picker is choosing between.
 *
 * Only the words and the icon differ, so the two kinds share one
 * implementation: "no PDFs yet" and "no images yet" are the same screen with a
 * different noun, and writing them twice is how they drift apart.
 */
type Kind = 'pdf' | 'image'

const WORDING = {
  pdf: {
    icon: FileText,
    one: 'PDF',
    emptyTitle: 'No PDFs yet',
    emptyOthers: 'These tools work on PDFs, and none of your documents is one.',
    emptyNone: 'Upload a PDF and it will show up here.',
    upload: 'Upload a PDF',
    add: 'Add a PDF',
    loading: 'Loading your PDFs',
    chooseOne: 'Choose a PDF',
  },
  image: {
    icon: ImageIcon,
    one: 'image',
    emptyTitle: 'No images yet',
    emptyOthers: 'This tool works on images, and none of your documents is one.',
    emptyNone:
      'Upload an image — JPG, PNG, GIF, BMP, TIFF, WEBP or HEIC — and it will show up here.',
    upload: 'Upload an image',
    add: 'Add an image',
    loading: 'Loading your images',
    chooseOne: 'Choose an image',
  },
} as const

/**
 * The loading, empty and error states every picker shares.
 *
 * A plain function rather than a component, and deliberately lowercase: the
 * caller needs to know whether there is a placeholder at all, and a JSX
 * element is always truthy, so `<Placeholder />` could never answer that.
 */
function pickerPlaceholder({
  kind,
  isPending,
  isError,
  error,
  isEmpty,
  hasOnlyOtherTypes,
  onRetry,
}: {
  kind: Kind
  isPending: boolean
  isError: boolean
  error: unknown
  isEmpty: boolean
  hasOnlyOtherTypes: boolean
  onRetry: () => void
}): React.ReactNode | null {
  const words = WORDING[kind]

  if (isPending) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label={words.loading}>
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
        <p className="font-medium">
          {hasOnlyOtherTypes ? words.emptyTitle : 'Nothing to work with yet'}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasOnlyOtherTypes ? words.emptyOthers : words.emptyNone}
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
        >
          {words.upload}
        </Link>
      </div>
    )
  }

  return null
}

/**
 * The way to add a file that is not in the list yet.
 *
 * Sits under the list rather than in the page header, because that is where
 * someone is looking when they notice the file they wanted is missing. Without
 * it, a tool is a dead end for anyone whose next document has not been
 * uploaded: the only route is the header logo, and nothing says so.
 *
 * The same small outline button as the dashboard's tool shortcuts, down to the
 * size: it is a way out of this step, not one of the things being chosen in
 * it, and a full-width row would sit among the files looking tickable.
 *
 * The empty state already offers an upload, so this appears only when there is
 * a list for it to sit under; otherwise one screen would say it twice.
 */
function AddDocumentLink({ kind }: { kind: Kind }) {
  return (
    <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>
      <Plus aria-hidden />
      {WORDING[kind].add}
    </Link>
  )
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
  hasOnlyNonPdfs,
  ...state
}: PickerProps & { value: string | null; onChange: (id: string) => void }) {
  const placeholder = pickerPlaceholder({
    ...state,
    kind: 'pdf',
    hasOnlyOtherTypes: hasOnlyNonPdfs,
    isEmpty: state.documents.length === 0,
  })
  if (placeholder !== null) return placeholder

  return (
    <div className="space-y-2">
      <RadioGroup
        // `value` is passed through as null, never as undefined: Base UI decides
        // on first render whether a group is controlled, and treats undefined as
        // uncontrolled. Collapsing null to undefined made the group flip from
        // uncontrolled to controlled the moment a PDF was chosen.
        value={value}
        onValueChange={(next) => onChange(String(next))}
        aria-label="Choose a PDF"
      >
        {state.documents.map((document) => (
          <label
            key={document.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
              value === document.id ? 'border-brand bg-brand-muted/40' : 'hover:bg-muted/40',
            )}
          >
            <RadioGroupItem value={document.id} />
            <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {document.original_filename}
              </span>
              <span className="text-muted-foreground block text-xs">{meta(document)}</span>
            </span>
            {/* Checking you picked the right file should not mean leaving the
                tool and coming back. */}
            <PreviewButton
              documentId={document.id}
              filename={document.original_filename}
              mimeType={document.mime_type}
            />
          </label>
        ))}
      </RadioGroup>

      {/* Outside the group, not the last item in it: a radio group takes arrow
          keys to move between its options, and a link among them would be a
          stop that cannot be chosen. */}
      <AddDocumentLink kind="pdf" />
    </div>
  )
}

/**
 * Choose any number of documents of one kind.
 *
 * Ticking a file appends it to the selection rather than inserting it by list
 * position, so the order the user builds up is the order they get.
 */
function MultiSelect({
  kind,
  selected,
  onToggle,
  hasOnlyOtherTypes,
  ...state
}: Omit<PickerProps, 'hasOnlyNonPdfs'> & {
  kind: Kind
  hasOnlyOtherTypes: boolean
  selected: string[]
  onToggle: (id: string) => void
}) {
  const placeholder = pickerPlaceholder({
    ...state,
    kind,
    hasOnlyOtherTypes,
    isEmpty: state.documents.length === 0,
  })
  if (placeholder !== null) return placeholder

  const Icon = WORDING[kind].icon

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {state.documents.map((document) => {
          const isSelected = selected.includes(document.id)
          return (
            <li key={document.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  isSelected ? 'border-brand bg-brand-muted/40' : 'hover:bg-muted/40',
                )}
              >
                {/* No aria-label here: the whole row is the checkbox's label,
                  so Base UI points aria-labelledby at it and any aria-label
                  we set would be ignored. The name is the filename and its
                  size, which is what a user is choosing between anyway. */}
                <Checkbox checked={isSelected} onCheckedChange={() => onToggle(document.id)} />
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {document.original_filename}
                  </span>
                  <span className="text-muted-foreground block text-xs">{meta(document)}</span>
                </span>
                {canPreviewInBrowser(document.mime_type) && (
                  <PreviewButton
                    documentId={document.id}
                    filename={document.original_filename}
                    mimeType={document.mime_type}
                  />
                )}
              </label>
            </li>
          )
        })}
      </ul>

      {/* Outside the list: the list is the files, and an "add" among them
          would be one more thing that looks tickable. */}
      <AddDocumentLink kind={kind} />
    </div>
  )
}

/** Choose any number of PDFs. */
export function PdfMultiSelect({
  hasOnlyNonPdfs,
  ...props
}: PickerProps & { selected: string[]; onToggle: (id: string) => void }) {
  return <MultiSelect {...props} kind="pdf" hasOnlyOtherTypes={hasOnlyNonPdfs} />
}

/** Choose any number of images. */
export function ImageMultiSelect({
  hasOnlyNonImages,
  ...props
}: Omit<PickerProps, 'hasOnlyNonPdfs'> & {
  hasOnlyNonImages: boolean
  selected: string[]
  onToggle: (id: string) => void
}) {
  return <MultiSelect {...props} kind="image" hasOnlyOtherTypes={hasOnlyNonImages} />
}
