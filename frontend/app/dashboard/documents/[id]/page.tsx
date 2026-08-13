'use client'

import { useQuery } from '@tanstack/react-query'
import { Download, LayoutGrid, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { BackLink } from '@/components/shared/back-link'
import { PageThumbnail } from '@/components/tools/page-thumbnail'
import { PageViewer } from '@/components/tools/page-viewer'
import { canPreviewInBrowser } from '@/components/tools/use-documents'
import { useImageSource } from '@/components/tools/use-image-source'
import { usePdfDocument } from '@/components/tools/use-pdf-document'
import { Button, buttonVariants } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { downloadDocument, getDocument } from '@/lib/documents'
import { formatBytes, formatPages } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * A read-only look at a document, page by page.
 *
 * Shares the renderer with the organiser: the same lazy thumbnails, without
 * the editing. Building a second viewer that drew pages a different way would
 * be two things to keep working.
 */
export default function DocumentPreviewPage() {
  const params = useParams<{ id: string }>()
  const documentId = params.id
  const [isDownloading, setIsDownloading] = useState(false)
  // Which page is open full screen, or null when the viewer is closed.
  const [openPage, setOpenPage] = useState<number | null>(null)

  const details = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () => getDocument(documentId),
  })

  const isPdf = details.data?.mime_type === 'application/pdf'
  // Only the ones a browser will draw. A TIFF or a HEIC converts perfectly
  // well; it is showing one here that no browser outside Safari will do.
  const isImage = canPreviewInBrowser(details.data?.mime_type ?? '') && !isPdf
  const {
    document: pdf,
    pageCount,
    isLoading,
    error: openError,
  } = usePdfDocument(isPdf ? documentId : null)
  const { url: imageUrl, error: imageError } = useImageSource(isImage ? documentId : null)

  async function handleDownload() {
    if (!details.data) return
    setIsDownloading(true)
    try {
      await downloadDocument(documentId, details.data.original_filename)
    } catch {
      toast.error('That file could not be downloaded.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (details.isPending) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }

  if (details.isError) {
    return (
      <div role="alert" className="rounded-lg border border-dashed px-6 py-10 text-center">
        <p className="font-medium">This document is not available</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {details.error instanceof ApiError ? details.error.message : 'Something went wrong.'}
        </p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
        >
          Back to documents
        </Link>
      </div>
    )
  }

  const document = details.data
  const pages = formatPages(document.page_count)

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard">All documents</BackLink>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl">{document.original_filename}</h1>
            <p className="text-muted-foreground tabular mt-2 text-sm">
              {formatBytes(document.file_size)}
              {pages ? ` · ${pages}` : ''}
            </p>
          </div>

          <div className="flex gap-2">
            {isPdf && (
              <Link
                href="/dashboard/tools/organise"
                className={cn(buttonVariants({ variant: 'outline' }))}
              >
                <LayoutGrid aria-hidden />
                Organise pages
              </Link>
            )}
            <Button onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              {isDownloading ? 'Downloading…' : 'Download'}
            </Button>
          </div>
        </div>
      </div>

      {isImage && (
        <div className="bg-muted/40 flex justify-center rounded-lg p-4">
          {imageError ? (
            <p className="text-destructive py-16 text-sm" role="alert">
              {imageError}
            </p>
          ) : imageUrl ? (
            // A blob URL of the user's own file, which next/image cannot fetch
            // to optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={document.original_filename}
              className="max-h-[70vh] rounded object-contain shadow-sm"
            />
          ) : (
            <Loader2 className="text-muted-foreground my-16 size-6 animate-spin" aria-hidden />
          )}
        </div>
      )}

      {!isPdf && !isImage && (
        <p className="text-muted-foreground rounded-lg border border-dashed px-6 py-10 text-center text-sm">
          {document.mime_type === 'application/zip'
            ? 'This is an archive. Download it to see what is inside.'
            : document.mime_type.startsWith('image/')
              ? 'No browser can display this kind of image, so it cannot be shown here. It converts to PDF perfectly well. Download it to open it.'
              : 'This kind of file cannot be shown here. Download it to open it.'}
        </p>
      )}

      {isPdf && isLoading && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-busy="true">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Opening the document…
        </p>
      )}

      {openError && (
        <p className="text-destructive text-sm" role="alert">
          {openError}
        </p>
      )}

      {isPdf && pageCount > 0 && (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Pages">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
              <li key={pageNumber}>
                {/* A button, not a div with a click handler: opening a page is
                    an action, and this way it is reachable by keyboard and
                    announced as something that can be pressed. */}
                <button
                  type="button"
                  onClick={() => setOpenPage(pageNumber)}
                  className="bg-background hover:border-brand/60 focus-visible:ring-ring block w-full rounded-lg border p-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={`View page ${pageNumber} full screen`}
                >
                  <PageThumbnail
                    document={pdf}
                    pageNumber={pageNumber}
                    rotation={0}
                    className="mx-auto"
                  />
                  <span className="text-muted-foreground mt-2 block pl-1 text-xs font-medium tabular-nums">
                    {pageNumber}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <PageViewer
            document={pdf}
            filename={document.original_filename}
            pageCount={pageCount}
            pageNumber={openPage}
            onPageChange={setOpenPage}
            onClose={() => setOpenPage(null)}
          />
        </>
      )}
    </div>
  )
}
