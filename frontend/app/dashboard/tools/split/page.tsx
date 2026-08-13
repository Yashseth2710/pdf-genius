'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Scissors } from 'lucide-react'
import { useState } from 'react'

import { PdfSingleSelect } from '@/components/tools/document-picker'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { usePdfDocuments } from '@/components/tools/use-documents'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ApiError } from '@/lib/api'
import { splitDocument } from '@/lib/tools'
import { cn } from '@/lib/utils'
import type { SplitMode } from '@/types/api'

const MODES: { value: SplitMode; title: string; description: string }[] = [
  {
    value: 'ranges',
    title: 'By page ranges',
    description: 'One file per range, for example 1-3, 5, 8-10.',
  },
  {
    value: 'every_page',
    title: 'Every page separately',
    description: 'One file per page, each saved as its own PDF.',
  },
  {
    value: 'pages',
    title: 'Selected pages into one file',
    description: 'Pull a few pages out into a single new PDF.',
  },
]

export default function SplitPage() {
  const queryClient = useQueryClient()
  const { pdfs, isPending, isError, error, hasOnlyNonPdfs, refetch } = usePdfDocuments()

  const [documentId, setDocumentId] = useState<string | null>(null)
  const [mode, setMode] = useState<SplitMode>('ranges')
  const [ranges, setRanges] = useState('')
  const [pages, setPages] = useState('')

  const split = useMutation({
    mutationFn: splitDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const chosen = pdfs.find((item) => item.id === documentId) ?? null
  // The same "1-3, 5" text works for both modes, so the page list is parsed
  // from it rather than making people learn a second syntax.
  const pageNumbers = parsePageList(pages)

  function reset() {
    setDocumentId(null)
    setMode('ranges')
    setRanges('')
    setPages('')
    split.reset()
  }

  const needsRanges = mode === 'ranges' && ranges.trim().length === 0
  const needsPages = mode === 'pages' && pageNumbers.length === 0
  const canRun = documentId !== null && !needsRanges && !needsPages && !split.isPending

  return (
    <ToolShell
      title="Split a PDF"
      description="Pull pages out of a PDF, by range, one at a time, or as a selection."
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

      <ToolStep step={2} title="Choose how to split it">
        <RadioGroup
          value={mode}
          onValueChange={(next) => setMode(next as SplitMode)}
          aria-label="How to split"
        >
          {MODES.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                mode === option.value ? 'border-brand bg-brand-muted/40' : 'hover:bg-muted/40',
              )}
            >
              <RadioGroupItem value={option.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="text-muted-foreground block text-xs">{option.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>

        {mode === 'ranges' && (
          <div className="mt-4 max-w-sm space-y-2">
            <Label htmlFor="ranges">Pages to split out</Label>
            <Input
              id="ranges"
              value={ranges}
              onChange={(event) => setRanges(event.target.value)}
              placeholder="1-3, 5, 8-10"
              maxLength={1000}
            />
            <p className="text-muted-foreground text-xs">
              Each range becomes its own PDF, saved to your documents.
              {chosen?.page_count ? ` This PDF has ${chosen.page_count} pages.` : ''}
            </p>
          </div>
        )}

        {mode === 'pages' && (
          <div className="mt-4 max-w-sm space-y-2">
            <Label htmlFor="pages">Pages to keep</Label>
            <Input
              id="pages"
              value={pages}
              onChange={(event) => setPages(event.target.value)}
              placeholder="2, 5, 9"
              maxLength={1000}
            />
            <p className="text-muted-foreground text-xs">
              {pageNumbers.length > 0
                ? `${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'} into one new PDF.`
                : 'All of these end up in a single new PDF.'}
              {chosen?.page_count ? ` This PDF has ${chosen.page_count} pages.` : ''}
            </p>
          </div>
        )}
      </ToolStep>

      <div className="space-y-4 border-t pt-6">
        {split.isError && (
          <p className="text-destructive text-sm" role="alert">
            {split.error instanceof ApiError
              ? split.error.message
              : 'That file could not be split. Please try again.'}
          </p>
        )}

        <Button
          size="lg"
          disabled={!canRun}
          onClick={() =>
            split.mutate({
              document_id: documentId!,
              mode,
              ...(mode === 'ranges' ? { ranges: ranges.trim() } : {}),
              ...(mode === 'pages' ? { pages: pageNumbers } : {}),
            })
          }
        >
          {split.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Scissors aria-hidden />
          )}
          {split.isPending ? 'Splitting…' : 'Split PDF'}
        </Button>

        {documentId === null && (
          <p className="text-muted-foreground text-sm">Choose a PDF to split.</p>
        )}
      </div>

      {split.isSuccess && (
        <ToolResult
          outputs={split.data.outputs}
          onReset={reset}
          archiveName={`${(chosen?.original_filename ?? 'document').replace(/\.pdf$/i, '')}-split.zip`}
        />
      )}
    </ToolShell>
  )
}

/**
 * Read "2, 5, 9" or "2 5 9" as a list of page numbers.
 *
 * Anything unparseable is dropped rather than guessed at; the backend still
 * checks the result against the real document, which is the only place that
 * knows how many pages there are.
 */
function parsePageList(input: string): number[] {
  return input
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isInteger(value) && value > 0)
}
