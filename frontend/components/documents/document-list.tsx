'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileImage, FileText, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { deleteDocument, downloadDocument, listDocuments } from '@/lib/documents'
import { formatBytes, formatPages } from '@/lib/format'
import type { DocumentSummary } from '@/types/api'

const PAGE_SIZE = 20

export function DocumentList() {
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['documents', offset],
    queryFn: () => listDocuments(PAGE_SIZE, offset),
  })

  const removal = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      toast.success('Document deleted')
    },
    onError: (failure: unknown) => {
      toast.error(
        failure instanceof ApiError ? failure.message : 'That document could not be deleted.',
      )
    },
  })

  if (isPending) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading documents">
        {[0, 1, 2].map((row) => (
          <li key={row} className="bg-muted/50 h-[68px] animate-pulse rounded-lg" />
        ))}
      </ul>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="rounded-lg border border-dashed px-6 py-10 text-center">
        <p className="font-medium">Could not load your documents</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {error instanceof ApiError ? error.message : 'Something went wrong.'}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (data.items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-14 text-center">
        <span className="bg-muted mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <FileText className="text-muted-foreground size-6" aria-hidden />
        </span>
        <h3 className="font-medium">No documents yet</h3>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Upload a PDF or an image above and it will appear here.
        </p>
      </div>
    )
  }

  const pageCount = Math.ceil(data.total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {data.items.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onDelete={() => removal.mutate(document.id)}
            isDeleting={removal.isPending && removal.variables === document.id}
          />
        ))}
      </ul>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <p className="text-muted-foreground text-sm">
            Page {currentPage} of {pageCount} — {data.total} documents
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}

function DocumentRow({
  document,
  onDelete,
  isDeleting,
}: {
  document: DocumentSummary
  onDelete: () => void
  isDeleting: boolean
}) {
  const [isDownloading, setIsDownloading] = useState(false)
  const Icon = document.mime_type === 'application/pdf' ? FileText : FileImage
  const pages = formatPages(document.page_count)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await downloadDocument(document.id, document.original_filename)
    } catch {
      toast.error('That file could not be downloaded.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <li className="hover:bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors">
      <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.original_filename}</p>
        <p className="text-muted-foreground text-xs">
          {formatBytes(document.file_size)}
          {pages ? ` · ${pages}` : ''}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleDownload}
        disabled={isDownloading}
        aria-label={`Download ${document.original_filename}`}
      >
        {isDownloading ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Download aria-hidden />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={isDeleting}
        aria-label={`Delete ${document.original_filename}`}
        className="text-muted-foreground hover:text-destructive"
      >
        {isDeleting ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
      </Button>
    </li>
  )
}
