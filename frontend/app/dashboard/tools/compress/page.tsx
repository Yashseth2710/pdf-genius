'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Minimize2 } from 'lucide-react'
import { useState } from 'react'

import { PdfSingleSelect } from '@/components/tools/document-picker'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { usePdfDocuments } from '@/components/tools/use-documents'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ApiError } from '@/lib/api'
import { formatBytes } from '@/lib/format'
import { compressDocument, compressionOf } from '@/lib/tools'
import { cn } from '@/lib/utils'
import type { CompressionLevel } from '@/types/api'

const LEVELS: { value: CompressionLevel; title: string; description: string }[] = [
  {
    value: 'basic',
    title: 'Basic',
    description: 'Tidies the file up without changing anything in it. Nothing is lost.',
  },
  {
    value: 'balanced',
    title: 'Balanced',
    description: 'Redraws photographs at 150 DPI — still fine to print. Text is untouched.',
  },
  {
    value: 'strong',
    title: 'Strong',
    description: 'Redraws photographs at screen resolution. Smallest file, softest pictures.',
  },
]

export default function CompressPage() {
  const queryClient = useQueryClient()
  const { pdfs, isPending, isError, error, hasOnlyNonPdfs, refetch } = usePdfDocuments()

  const [documentId, setDocumentId] = useState<string | null>(null)
  const [level, setLevel] = useState<CompressionLevel>('balanced')

  const compress = useMutation({
    mutationFn: compressDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const chosen = pdfs.find((item) => item.id === documentId) ?? null
  const measured = compress.isSuccess ? compressionOf(compress.data) : null

  function reset() {
    setDocumentId(null)
    setLevel('balanced')
    compress.reset()
  }

  return (
    <ToolShell
      title="Compress a PDF"
      description="Make a PDF smaller. How much smaller is measured afterwards, never guessed."
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

      <ToolStep
        step={2}
        title="Choose how hard to try"
        description="Every level leaves text and drawings exactly as they are; only photographs are redrawn."
      >
        <RadioGroup
          value={level}
          onValueChange={(next) => setLevel(next as CompressionLevel)}
          aria-label="How much to compress"
        >
          {LEVELS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                level === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
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

        <p className="text-muted-foreground mt-4 text-xs">
          Nothing here can tell you the size beforehand: the same setting takes most of a scanned
          document away and nothing at all off a page of text. You will see the real figure once it
          has run.
        </p>
      </ToolStep>

      <div className="space-y-4 border-t pt-6">
        {compress.isError && (
          <p className="text-destructive text-sm" role="alert">
            {compress.error instanceof ApiError
              ? compress.error.message
              : 'That file could not be compressed. Please try again.'}
          </p>
        )}

        <Button
          size="lg"
          disabled={documentId === null || compress.isPending}
          onClick={() => compress.mutate({ document_id: documentId!, level })}
        >
          {compress.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Minimize2 aria-hidden />
          )}
          {compress.isPending ? 'Compressing…' : 'Compress PDF'}
        </Button>

        {documentId === null && (
          <p className="text-muted-foreground text-sm">Choose a PDF to compress.</p>
        )}
      </div>

      {compress.isSuccess &&
        (compress.data.outputs.length > 0 ? (
          <div className="space-y-4">
            {measured && <SavingSummary measured={measured} />}
            <ToolResult outputs={compress.data.outputs} onReset={reset} />
          </div>
        ) : (
          <NothingToSave
            filename={chosen?.original_filename ?? 'That PDF'}
            size={measured?.original_size ?? chosen?.file_size ?? 0}
            onReset={reset}
          />
        ))}
    </ToolShell>
  )
}

/** The measured before and after. Every number here came back from the run. */
function SavingSummary({
  measured,
}: {
  measured: { original_size: number; final_size: number; saved_percent: number }
}) {
  return (
    <div className="bg-primary/5 border-primary/20 rounded-lg border px-4 py-3">
      <p className="text-sm font-medium">
        {Math.round(measured.saved_percent)}% smaller
        <span className="text-muted-foreground ml-2 font-normal tabular-nums">
          {formatBytes(measured.original_size)} → {formatBytes(measured.final_size)}
        </span>
      </p>
    </div>
  )
}

/**
 * The honest ending: this file was already as small as it goes.
 *
 * Deliberately not styled as an error, because nothing went wrong. The
 * alternative — saving a copy the same size and reporting "0% smaller" — would
 * put a pointless duplicate in the user's documents and call it a success.
 */
function NothingToSave({
  filename,
  size,
  onReset,
}: {
  filename: string
  size: number
  onReset: () => void
}) {
  return (
    <div
      role="status"
      aria-label="Result"
      className="space-y-3 rounded-lg border border-dashed px-4 py-5"
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="text-muted-foreground size-4" aria-hidden />
        Already as small as it goes
      </p>
      <p className="text-muted-foreground text-sm">
        {filename} is {formatBytes(size)} and has nothing left worth taking out — it is text and
        drawings rather than photographs, or it has been compressed before. Nothing was saved to
        your documents, because a copy of the same size would not have been worth keeping.
      </p>
      <Button variant="outline" size="sm" onClick={onReset}>
        Try another PDF
      </Button>
    </div>
  )
}
