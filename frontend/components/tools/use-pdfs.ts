'use client'

import { useQuery } from '@tanstack/react-query'

import { listDocuments } from '@/lib/documents'
import type { DocumentSummary } from '@/types/api'

/** The most documents the list endpoint will return in one page. */
const PAGE_LIMIT = 100

/**
 * The user's PDFs, for a tool to work on.
 *
 * Filtered here rather than by the API: the endpoint takes no type parameter
 * yet, and one page of a hundred covers any account this project has. If that
 * stops being true the filter belongs in the query, not in the browser.
 */
export function usePdfDocuments() {
  const query = useQuery({
    queryKey: ['documents', 'all'],
    queryFn: () => listDocuments(PAGE_LIMIT, 0),
  })

  const pdfs: DocumentSummary[] =
    query.data?.items.filter((item) => item.mime_type === 'application/pdf') ?? []

  return {
    ...query,
    pdfs,
    /** True when the account has documents, but none of them are PDFs. */
    hasOnlyNonPdfs: (query.data?.items.length ?? 0) > 0 && pdfs.length === 0,
  }
}
