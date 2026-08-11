'use client'

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

import { renderPage } from '@/lib/pdf-render'
import { cn } from '@/lib/utils'

const THUMBNAIL_WIDTH = 160

/**
 * One page, drawn only once it is close to being looked at.
 *
 * The roadmap flagged this as the thing that would freeze a tab: rendering
 * every page of a 200-page document up front is seconds of work and hundreds
 * of megabytes of canvas. An IntersectionObserver with generous margins means
 * a page is drawn just before it scrolls into view and never at all if the
 * user does not get that far.
 */
export function PageThumbnail({
  document,
  pageNumber,
  rotation,
  dimmed,
  className,
}: {
  document: PDFDocumentProxy | null
  pageNumber: number
  /** Applied as CSS, so turning a page is instant and needs no re-render. */
  rotation: number
  dimmed?: boolean
  className?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = holder.current
    if (!element || isVisible) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      // A screen's worth of margin, so a page is ready by the time it arrives
      // rather than appearing blank and filling in afterwards.
      { rootMargin: '600px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [isVisible])

  useEffect(() => {
    if (!document || !isVisible) return

    let cancelled = false
    void renderPage(document, pageNumber, THUMBNAIL_WIDTH)
      .then((canvas) => {
        // The user may have scrolled on, or the document may have been swapped.
        if (cancelled || !holder.current) return
        holder.current.replaceChildren(canvas)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [document, pageNumber, isVisible])

  return (
    <div
      className={cn(
        'bg-muted/40 flex items-center justify-center overflow-hidden rounded transition-opacity',
        dimmed && 'opacity-30',
        className,
      )}
      style={{
        // Rotating the canvas in CSS keeps a turn instantaneous. The document
        // itself is only rewritten when the user saves.
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transition: 'transform 150ms ease',
      }}
    >
      <div ref={holder} aria-hidden>
        {failed ? (
          <p className="text-muted-foreground p-4 text-center text-xs">
            This page could not be drawn
          </p>
        ) : (
          <div
            className="bg-muted animate-pulse"
            style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_WIDTH * 1.414 }}
          />
        )}
      </div>
    </div>
  )
}
