'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileArchive, FileImage, FileText, Loader2, Trash2 } from 'lucide-react'
import Link from '@/components/shared/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { PreviewButton } from '@/components/tools/preview-button'
import { canPreviewInBrowser } from '@/components/tools/use-documents'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { deleteDocument, downloadDocument, listDocuments } from '@/lib/documents'
import { formatBytes, formatPages } from '@/lib/format'
import type { DocumentSummary } from '@/types/api'

const PAGE_SIZE = 20

/**
 * Uploads are PDFs or images; a ZIP only ever arrives as a split result.
 *
 * A lookup rather than a function that returns a component: the lint rule for
 * components created during render cannot tell the two apart, and it is right
 * to be suspicious of the second.
 */
const ICONS: Record<string, typeof FileText> = {
  'application/pdf': FileText,
  'application/zip': FileArchive,
}

export function DocumentList() {
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['documents', offset],
    queryFn: () => listDocuments(PAGE_SIZE, offset),
  })

  const removal = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document deleted')
    },
    onError: (failure: unknown) => {
      toast.error(
        failure instanceof ApiError ? failure.message : 'That document could not be deleted.',
      )
    },
  })

  if (isPending) {
    return (
      <ul className="border-t" aria-busy="true" aria-label="Loading documents">
        {[0, 1, 2].map((row) => (
          <li key={row} className="border-b px-3 py-3">
            <div className="bg-muted h-4 w-56 max-w-full animate-pulse rounded" />
            <div className="bg-muted mt-2 h-3 w-24 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-dashed px-6 py-10">
        <p className="font-medium">Could not load your documents</p>
        <p className="text-muted-foreground mt-1 max-w-md text-sm">
          {error instanceof ApiError ? error.message : 'Something went wrong.'}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (data.items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12">
        <h3 className="text-lg">No documents yet</h3>
        <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">
          Upload a PDF or an image above and it will appear here.
        </p>
      </div>
    )
  }

  const pageCount = Math.ceil(data.total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-4">
      <ul className="border-t">
        {data.items.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onDelete={() => removal.mutate(document.id)}
            isDeleting={removal.isPending && removal.variables === document.id}
          />
        ))}
      </ul>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-muted-foreground tabular text-sm">
            Page {currentPage} of {pageCount}, {data.total} documents
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
    </div>
  )
}

function DocumentRow({
  document,
  onDelete,
  isDeleting,
}: {
  document: DocumentSummary
  onDelete: () => void
  isDeleting: boolean
}) {
  const [isDownloading, setIsDownloading] = useState(false)
  const Icon = ICONS[document.mime_type] ?? FileImage
  const pages = formatPages(document.page_count)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await downloadDocument(document.id, document.original_filename)
    } catch {
      toast.error('That file could not be downloaded.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    // A ruled row, and the file icon is just an icon. The tinted rounded square
    // behind a small glyph is the most recognisable piece of generated-UI
    // furniture, and down a list of twenty documents it is twenty coloured
    // squares telling you nothing the filename did not.
    <li className="hover:bg-muted/50 relative flex items-center gap-3 border-b px-3 py-3 transition-colors">
      <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        {/* The name is the way in to the document, which is where people
            instinctively click. The link covers the whole row so the target is
            not a few pixels of text. */}
        <Link
          href={`/dashboard/documents/${document.id}`}
          className="focus-visible:ring-ring block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
        >
          {document.original_filename}
        </Link>
        <p className="text-muted-foreground tabular mt-0.5 text-xs">
          {formatBytes(document.file_size)}
          {pages ? ` · ${pages}` : ''}
        </p>
      </div>

      {/* The icons carry an aria-label for screen readers; the tooltip is what
          tells a sighted user what the icon does before they click it. */}
      {/* PDFs and images both have a viewer now. TIFF and HEIC are the
          exceptions: they convert fine, but no browser outside Safari will
          draw one, so offering a preview would open an empty box. */}
      {canPreviewInBrowser(document.mime_type) && (
        <PreviewButton
          documentId={document.id}
          filename={document.original_filename}
          mimeType={document.mime_type}
        />
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              onClick={handleDownload}
              disabled={isDownloading}
            />
          }
          aria-label={`Download ${document.original_filename}`}
        >
          {isDownloading ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
        </TooltipTrigger>
        <TooltipContent>{isDownloading ? 'Downloading…' : 'Download'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-muted-foreground hover:text-destructive relative"
            />
          }
          aria-label={`Delete ${document.original_filename}`}
        >
          {isDeleting ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
        </TooltipTrigger>
        <TooltipContent>{isDeleting ? 'Deleting…' : 'Delete'}</TooltipContent>
      </Tooltip>
    </li>
  )
}
