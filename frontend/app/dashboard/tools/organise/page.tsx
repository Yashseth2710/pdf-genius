'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { PageOrganiser } from '@/components/tools/page-organiser'
import { PdfSingleSelect } from '@/components/tools/pdf-picker'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { usePdfDocument } from '@/components/tools/use-pdf-document'
import { usePdfDocuments } from '@/components/tools/use-pdfs'

export default function OrganisePage() {
  const { pdfs, isPending, isError, error, hasOnlyNonPdfs, refetch } = usePdfDocuments()
  const [documentId, setDocumentId] = useState<string | null>(null)

  // The page count comes from the opened file rather than the stored column:
  // the column is a hint written at upload time, and the grid must match what
  // is actually in the document.
  const { document, pageCount, isLoading, error: openError } = usePdfDocument(documentId)
  const chosen = pdfs.find((item) => item.id === documentId) ?? null

  return (
    <ToolShell
      title="Organise pages"
      description="Turn, reorder and remove pages, then save the result as a new document."
    >
      <ToolStep step={1} title="Choose a PDF">
        <PdfSingleSelect
          documents={pdfs}
          isPending={isPending}
          isError={isError}
          error={error}
          hasOnlyNonPdfs={hasOnlyNonPdfs}
          onRetry={() => void refetch()}
          value={documentId}
          onChange={setDocumentId}
        />
      </ToolStep>

      {documentId && isLoading && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-busy="true">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Opening {chosen?.original_filename}…
        </p>
      )}

      {openError && (
        <p className="text-destructive text-sm" role="alert">
          {openError}
        </p>
      )}

      {documentId && chosen && pageCount > 0 && (
        // Keyed on the document so choosing a different one starts from a
        // clean plan, rather than carrying the last document's edits over.
        <PageOrganiser
          key={documentId}
          documentId={documentId}
          filename={chosen.original_filename}
          document={document}
          pageCount={pageCount}
        />
      )}
    </ToolShell>
  )
}
