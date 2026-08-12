'use client'

import { useQuery } from '@tanstack/react-query'

import { listDocuments } from '@/lib/documents'
import type { DocumentSummary } from '@/types/api'

/** The most documents the list endpoint will return in one page. */
const PAGE_LIMIT = 100

/**
 * Every image type that can be bound into a PDF.
 *
 * The same set the established converters take. Matched against the stored
 * MIME type, which the server decided by reading the file's leading bytes, so
 * a photo renamed `.txt` is still recognised as a photo.
 */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/heic',
]

/**
 * The ones a browser will actually draw in an `<img>`.
 *
 * TIFF has never been supported outside Safari, and HEIC only in Safari, so a
 * preview of either is a broken image icon everywhere else. They convert
 * perfectly well — it is only *showing* them here that cannot be done.
 */
export const PREVIEWABLE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
]

export function canPreviewInBrowser(mimeType: string): boolean {
  return mimeType === 'application/pdf' || PREVIEWABLE_IMAGE_TYPES.includes(mimeType)
}

/**
 * The user's documents of one kind, for a tool to work on.
 *
 * Filtered here rather than by the API: the endpoint takes no type parameter
 * yet, and one page of a hundred covers any account this project has. If that
 * stops being true the filter belongs in the query, not in the browser.
 */
function useDocumentsOfType(types: string[]) {
  const query = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: () => listDocuments(PAGE_LIMIT, 0),
  })

  const matching: DocumentSummary[] =
    query.data?.items.filter((item) => types.includes(item.mime_type)) ?? []

  return {
    ...query,
    documents: matching,
    /** True when the account has documents, but none of the kind wanted. */
    hasOnlyOtherTypes: (query.data?.items.length ?? 0) > 0 && matching.length === 0,
  }
}

/** The user's PDFs. */
export function usePdfDocuments() {
  const { documents, hasOnlyOtherTypes, ...query } = useDocumentsOfType(['application/pdf'])
  return { ...query, pdfs: documents, hasOnlyNonPdfs: hasOnlyOtherTypes }
}

/** The user's images, of every type that can be bound into a PDF. */
export function useImageDocuments() {
  const { documents, hasOnlyOtherTypes, ...query } = useDocumentsOfType(IMAGE_TYPES)
  return { ...query, images: documents, hasOnlyNonImages: hasOnlyOtherTypes }
}
