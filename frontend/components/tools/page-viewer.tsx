'use client'

import { ChevronLeft, ChevronRight, Loader2, Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { renderPage } from '@/lib/pdf-render'

/** Zoom steps, as multiples of "the whole page fits on screen". */
const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3] as const
/** Beyond this the canvas gets expensive to paint for no visible gain. */
const MAX_CANVAS_WIDTH = 3000

/**
 * One page, filling the screen, with a way to walk through the rest.
 *
 * Thumbnails are for finding a page; this is for reading it. The page is
 * scaled so the *whole* page fits by default, the way every PDF reader opens:
 * fitting the width alone draws an A4 page over a metre tall on a wide monitor
 * and leaves you scrolling through a single page. Zoom is there for anyone who
 * wants to go closer.
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
  const stage = useRef<HTMLDivElement>(null)
  const [zoomIndex, setZoomIndex] = useState(0)
  // What has been drawn, and at what. "Still drawing" is then simply not
  // holding an outcome for what is being asked for, which avoids writing state
  // from inside the effect.
  const [drawn, setDrawn] = useState<{ page: number; zoom: number; failed: boolean } | null>(null)

  const isOpen = pageNumber !== null
  const zoom = ZOOM_STEPS[zoomIndex]
  const settled = drawn?.page === pageNumber && drawn.zoom === zoom
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
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(-1)
      if (event.key === '+' || event.key === '=') {
        setZoomIndex((current) => Math.min(current + 1, ZOOM_STEPS.length - 1))
      }
      if (event.key === '-') setZoomIndex((current) => Math.max(current - 1, 0))
      if (event.key === '0') setZoomIndex(0)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, go])

  useEffect(() => {
    if (!document || pageNumber === null) return

    let cancelled = false
    // Measured from the box the page sits in rather than the window, so the
    // dialog's padding and the toolbar are already accounted for.
    const box = stage.current?.getBoundingClientRect()
    const maxWidth = Math.min(Math.max(box?.width ?? 800, 280), MAX_CANVAS_WIDTH)
    const maxHeight = Math.max(box?.height ?? 600, 320)

    void renderPage(document, pageNumber, { maxWidth, maxHeight, zoom })
      .then((canvas) => {
        if (cancelled || !holder.current) return
        canvas.className = 'h-auto max-w-none rounded shadow-lg'
        holder.current.replaceChildren(canvas)
        setDrawn({ page: pageNumber, zoom, failed: false })
      })
      .catch(() => {
        if (cancelled) return
        setDrawn({ page: pageNumber, zoom, failed: true })
      })

    return () => {
      cancelled = true
    }
  }, [document, pageNumber, zoom])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setZoomIndex(0)
          onClose()
        }
      }}
    >
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

        <div ref={stage} className="bg-muted/40 relative flex-1 overflow-auto rounded-lg p-4">
          <div className="flex min-h-full min-w-full items-center justify-center">
            {failed ? (
              <p className="text-muted-foreground py-16 text-sm" role="alert">
                This page could not be drawn.
              </p>
            ) : (
              <>
                {isDrawing && (
                  <Loader2
                    className="text-muted-foreground absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin"
                    aria-label="Drawing the page"
                  />
                )}
                <div ref={holder} className={isDrawing ? 'opacity-30' : undefined} aria-hidden />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
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

          <span className="bg-border mx-1 h-5 w-px" aria-hidden />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoomIndex((current) => Math.max(current - 1, 0))}
            disabled={zoomIndex === 0}
            aria-label="Zoom out"
          >
            <ZoomOut aria-hidden />
          </Button>
          <span className="text-muted-foreground w-14 text-center text-xs tabular-nums">
            {zoomIndex === 0 ? 'Fit page' : `${Math.round(zoom * 100)}%`}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoomIndex((current) => Math.min(current + 1, ZOOM_STEPS.length - 1))}
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            aria-label="Zoom in"
          >
            <ZoomIn aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setZoomIndex(0)}
            disabled={zoomIndex === 0}
            aria-label="Fit the whole page"
          >
            <Maximize aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
