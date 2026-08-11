import type { PDFDocumentProxy } from 'pdfjs-dist'

import { ApiError } from '@/lib/api'
import { tokenStore } from '@/lib/auth'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

/**
 * PDF.js, loaded once and only in the browser.
 *
 * The import is dynamic because pdf.js reaches for DOM APIs as it initialises,
 * which breaks server rendering, and because it is a large dependency that
 * nobody who never opens a document should have to download.
 */
let pdfjs: typeof import('pdfjs-dist') | null = null

async function library() {
  if (pdfjs) return pdfjs

  const loaded = await import('pdfjs-dist')
  // Rendering happens on a worker thread. Without this, pdf.js falls back to
  // doing the work on the main thread and a long document freezes the tab -
  // exactly the failure this scope was warned about.
  loaded.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  pdfjs = loaded
  return loaded
}

export interface OpenPdf {
  document: PDFDocumentProxy
  /** Aborts any in-flight request and shuts the worker down. */
  close: () => Promise<void>
}

/**
 * Fetch a document and open it with PDF.js.
 *
 * Downloaded through fetch rather than handed to pdf.js as a URL, because the
 * endpoint needs an Authorization header and pdf.js would request it without
 * one.
 *
 * The teardown comes back alongside the document because it lives on the
 * loading task, not on the document itself, and forgetting it leaks a worker
 * thread for every document opened.
 */
export async function loadDocument(documentId: string): Promise<OpenPdf> {
  const token = tokenStore.get()
  const response = await fetch(`${API_URL}/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new ApiError('DOWNLOAD_FAILED', 'That document could not be opened.', response.status)
  }

  const data = new Uint8Array(await response.arrayBuffer())
  const { getDocument } = await library()
  const task = getDocument({ data })

  return { document: await task.promise, close: () => task.destroy() }
}

/**
 * Draw one page onto a canvas, scaled to fit a box of ``maxWidth``.
 *
 * Returns the canvas rather than a data URL: a data URL for every page of a
 * 200-page document is a great deal of string to keep in memory, and the
 * canvas can be handed straight to the DOM.
 */
export async function renderPage(
  document: PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number,
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(pageNumber)
  const unscaled = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: maxWidth / unscaled.width })

  const canvas = window.document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw the page.')

  // Drawn at the device's pixel density, then scaled back down with CSS, so
  // thumbnails are not blurry on a high-DPI screen.
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(viewport.width * ratio)
  canvas.height = Math.floor(viewport.height * ratio)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: [ratio, 0, 0, ratio, 0, 0],
  }).promise

  // Frees the page's own buffers; the canvas we drew onto is unaffected.
  page.cleanup()

  return canvas
}
