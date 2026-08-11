'use client'

import { Eye, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { PageViewer } from '@/components/tools/page-viewer'
import { usePdfDocument } from '@/components/tools/use-pdf-document'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Look at a PDF without leaving whatever you were doing.
 *
 * Sits next to every place a document is chosen or produced, because the
 * cheapest way to avoid merging the wrong file is to be able to glance at it
 * first. The document is only downloaded and opened once the button is
 * pressed: a list of twenty PDFs must not fetch twenty PDFs.
 */
export function PreviewButton({
  documentId,
  filename,
  startPage = 1,
  label,
  appearance = 'icon',
}: {
  documentId: string
  filename: string
  /** Which page to open on. The organiser uses this to preview one page. */
  startPage?: number
  label?: string
  /** An icon in a dense list; a labelled button where there is room. */
  appearance?: 'icon' | 'button'
}) {
  const [openPage, setOpenPage] = useState<number | null>(null)
  const [hasOpened, setHasOpened] = useState(false)

  // Passing null until the button is pressed is what keeps this lazy; once
  // opened the document stays loaded, so closing and reopening is instant.
  const { document, pageCount, isLoading, error } = usePdfDocument(hasOpened ? documentId : null)

  const description = label ?? `Preview ${filename}`
  const isBusy = isLoading && openPage !== null

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

      {pageCount > 0 && (
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
