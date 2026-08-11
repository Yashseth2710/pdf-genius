'use client'

import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState } from 'react'

import { ApiError } from '@/lib/api'
import { loadDocument, type OpenPdf } from '@/lib/pdf-render'

interface LoadedPdf {
  document: PDFDocumentProxy | null
  pageCount: number
  isLoading: boolean
  error: string | null
}

interface Outcome {
  /** Which document this outcome belongs to, so a stale one is ignored. */
  id: string
  document: PDFDocumentProxy | null
  error: string | null
}

/**
 * Downloads a document and opens it with PDF.js.
 *
 * Not a TanStack Query: the result is a live object holding a worker thread and
 * its own buffers, and it has to be shut down when the component goes away. A
 * cache that kept it alive after unmount would leak a worker per document
 * opened.
 *
 * "Loading" is derived rather than stored — it is simply the state of holding
 * no outcome for the document being asked about. Storing it would mean writing
 * state from inside the effect, which React 19 rightly complains about.
 */
export function usePdfDocument(documentId: string | null): LoadedPdf {
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    if (!documentId) return

    let cancelled = false
    let opened: OpenPdf | null = null

    void loadDocument(documentId)
      .then((pdf) => {
        opened = pdf
        if (cancelled) {
          // Unmounted or switched documents while the download was in flight.
          void pdf.close()
          return
        }
        setOutcome({ id: documentId, document: pdf.document, error: null })
      })
      .catch((failure: unknown) => {
        if (cancelled) return
        setOutcome({
          id: documentId,
          document: null,
          error:
            failure instanceof ApiError
              ? failure.message
              : 'That document could not be opened. It may be damaged.',
        })
      })

    return () => {
      cancelled = true
      void opened?.close()
    }
  }, [documentId])

  if (!documentId) {
    return { document: null, pageCount: 0, isLoading: false, error: null }
  }

  const current = outcome?.id === documentId ? outcome : null

  return {
    document: current?.document ?? null,
    pageCount: current?.document?.numPages ?? 0,
    isLoading: current === null,
    error: current?.error ?? null,
  }
}
