'use client'

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { renderPage } from '@/lib/pdf-render'

/** How wide a page is drawn. Capped so a huge monitor does not ask for a
 *  20-megapixel canvas that takes a second to paint. */
const MAX_PAGE_WIDTH = 1400

/**
 * One page, filling the screen, with a way to walk through the rest.
 *
 * Thumbnails are for finding a page; this is for reading it. Rendered at the
 * width of the window rather than the 160px the grid uses, so the text is
 * actually legible.
 */
export function PageViewer({
  document,
  filename,
  pageCount,
  pageNumber,
  onPageChange,
  onClose,
}: {
  document: PDFDocumentProxy | null
  filename: string
  pageCount: number
  /** The page being shown, or null when the viewer is closed. */
  pageNumber: number | null
  onPageChange: (page: number) => void
  onClose: () => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  // What has been drawn, and for which page. "Still drawing" is then simply
  // not holding an outcome for the page being asked for, which avoids writing
  // state from inside the effect.
  const [drawn, setDrawn] = useState<{ page: number; failed: boolean } | null>(null)

  const isOpen = pageNumber !== null
  const settled = drawn?.page === pageNumber
  const isDrawing = isOpen && !settled
  const failed = settled && drawn.failed

  const go = useCallback(
    (delta: number) => {
      if (pageNumber === null) return
      const next = pageNumber + delta
      if (next >= 1 && next <= pageCount) onPageChange(next)
    },
    [pageNumber, pageCount, onPageChange],
  )

  useEffect(() => {
    if (!isOpen) return

    function handleKey(event: KeyboardEvent) {
      // Escape is the dialog's own job; these are the ones it does not cover.
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, go])

  useEffect(() => {
    if (!document || pageNumber === null) return

    let cancelled = false
    const width = Math.min(window.innerWidth - 96, MAX_PAGE_WIDTH)

    void renderPage(document, pageNumber, Math.max(width, 320))
      .then((canvas) => {
        if (cancelled || !holder.current) return
        canvas.className = 'max-w-full h-auto rounded shadow-lg'
        holder.current.replaceChildren(canvas)
        setDrawn({ page: pageNumber, failed: false })
      })
      .catch(() => {
        if (cancelled) return
        setDrawn({ page: pageNumber, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [document, pageNumber])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[92vh] max-w-[min(96vw,1500px)] flex-col gap-3 sm:max-w-[min(96vw,1500px)]"
        aria-describedby={undefined}
      >
        <DialogTitle className="truncate pr-10 text-base">
          {filename}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            page {pageNumber} of {pageCount}
          </span>
        </DialogTitle>

        <div className="bg-muted/40 flex-1 overflow-auto rounded-lg p-4">
          <div className="flex min-h-full items-start justify-center">
            {failed ? (
              <p className="text-muted-foreground py-16 text-sm" role="alert">
                This page could not be drawn.
              </p>
            ) : (
              <>
                {isDrawing && (
                  <Loader2
                    className="text-muted-foreground my-16 size-6 animate-spin"
                    aria-label="Drawing the page"
                  />
                )}
                <div ref={holder} className={isDrawing ? 'hidden' : undefined} aria-hidden />
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(-1)}
            disabled={pageNumber === 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(1)}
            disabled={pageNumber === pageCount}
            aria-label="Next page"
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
