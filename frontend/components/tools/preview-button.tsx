'use client'

import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { ImageViewer } from '@/components/tools/image-viewer'
import { PageViewer } from '@/components/tools/page-viewer'
import { usePdfDocument } from '@/components/tools/use-pdf-document'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Look at a document without leaving whatever you were doing.
 *
 * Sits next to every place a document is chosen or produced, because the
 * cheapest way to avoid merging the wrong file is to be able to glance at it
 * first. The document is only downloaded and opened once the button is
 * pressed: a list of twenty PDFs must not fetch twenty PDFs.
 *
 * Images get a viewer of their own rather than being left unpreviewable. They
 * are documents like any other here — a page exported to JPG is a result the
 * same way a split is — and the whole point of results being real documents is
 * that none of them is a dead end.
 */
export function PreviewButton({
  documentId,
  filename,
  mimeType = 'application/pdf',
  startPage = 1,
  label,
  appearance = 'icon',
}: {
  documentId: string
  filename: string
  /** Decides which viewer opens. Defaults to PDF, which most callers pass. */
  mimeType?: string
  /** Which page to open on. The organiser uses this to preview one page. */
  startPage?: number
  label?: string
  /** An icon in a dense list; a labelled button where there is room. */
  appearance?: 'icon' | 'button'
}) {
  const isImage = mimeType.startsWith('image/')

  const [openPage, setOpenPage] = useState<number | null>(null)
  const [hasOpened, setHasOpened] = useState(false)

  // Passing null until the button is pressed is what keeps this lazy; once
  // opened the document stays loaded, so closing and reopening is instant.
  // Images never reach PDF.js at all.
  const { document, pageCount, isLoading, error } = usePdfDocument(
    hasOpened && !isImage ? documentId : null,
  )

  const description = label ?? `Preview ${filename}`
  const isBusy = !isImage && isLoading && openPage !== null

  function open(event: React.MouseEvent) {
    // The row around this is often a link or a drag handle.
    event.preventDefault()
    event.stopPropagation()
    setHasOpened(true)
    setOpenPage(startPage)
  }

  return (
    <>
      {appearance === 'button' ? (
        <Button variant="outline" onClick={open} aria-label={description}>
          {isBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
          Preview
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-sm" className="relative" onClick={open} />}
            aria-label={description}
          >
            {isBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
          </TooltipTrigger>
          <TooltipContent>Preview</TooltipContent>
        </Tooltip>
      )}

      {error && openPage !== null && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}

      {isImage
        ? hasOpened && (
            <ImageViewer
              documentId={documentId}
              filename={filename}
              open={openPage !== null}
              onClose={() => setOpenPage(null)}
            />
          )
        : pageCount > 0 && (
            <PageViewer
              document={document}
              filename={filename}
              pageCount={pageCount}
              pageNumber={openPage}
              onPageChange={setOpenPage}
              onClose={() => setOpenPage(null)}
            />
          )}
    </>
  )
}
