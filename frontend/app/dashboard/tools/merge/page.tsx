'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Combine, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { PdfMultiSelect } from '@/components/tools/document-picker'
import { FileOrder } from '@/components/tools/file-order'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { usePdfDocuments } from '@/components/tools/use-documents'
import { resolveSelection, useOrderedSelection } from '@/components/tools/use-ordered-selection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { mergeDocuments } from '@/lib/tools'

const MAX_FILES = 20

export default function MergePage() {
  const queryClient = useQueryClient()
  const { pdfs, isPending, isError, error, hasOnlyNonPdfs, refetch } = usePdfDocuments()

  const selection = useOrderedSelection()
  const [outputName, setOutputName] = useState('merged.pdf')

  const merge = useMutation({
    mutationFn: mergeDocuments,
    onSuccess: () => {
      // The result is a document too, so every list of them is now stale.
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const chosen = resolveSelection(selection.ids, pdfs)

  function reset() {
    selection.clear()
    setOutputName('merged.pdf')
    merge.reset()
  }

  const tooFew = chosen.length < 2
  const tooMany = chosen.length > MAX_FILES

  return (
    <ToolShell
      title="Merge PDFs"
      description="Join several PDFs into one file, in the order you choose."
    >
      <ToolStep
        step={1}
        title="Choose your PDFs"
        description={`Pick at least two, up to ${MAX_FILES}.`}
      >
        <PdfMultiSelect
          documents={pdfs}
          isPending={isPending}
          isError={isError}
          error={error}
          hasOnlyNonPdfs={hasOnlyNonPdfs}
          onRetry={() => void refetch()}
          selected={selection.ids}
          onToggle={selection.toggle}
        />
      </ToolStep>

      <ToolStep
        step={2}
        title="Put them in order"
        description="Drag a file, or use the arrows. The first one becomes page 1."
      >
        <FileOrder
          documents={chosen}
          label="Merge order"
          emptyMessage="Nothing chosen yet. Tick at least two PDFs above."
          onReorder={selection.reorder}
          onRemove={selection.remove}
        />
      </ToolStep>

      <ToolStep step={3} title="Name the result">
        <div className="max-w-sm space-y-2">
          <Label htmlFor="output-name">File name</Label>
          <Input
            id="output-name"
            value={outputName}
            onChange={(event) => setOutputName(event.target.value)}
            maxLength={200}
          />
        </div>
      </ToolStep>

      <div className="space-y-4 border-t pt-6">
        {tooMany && (
          <p className="text-destructive text-sm" role="alert">
            You have chosen {chosen.length} files, and the limit is {MAX_FILES}.
          </p>
        )}

        {merge.isError && (
          <p className="text-destructive text-sm" role="alert">
            {merge.error instanceof ApiError
              ? merge.error.message
              : 'Those files could not be merged. Please try again.'}
          </p>
        )}

        <Button
          size="lg"
          disabled={tooFew || tooMany || merge.isPending || outputName.trim().length === 0}
          onClick={() =>
            merge.mutate({
              document_ids: selection.ids,
              output_name: outputName.trim(),
            })
          }
        >
          {merge.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Combine aria-hidden />
          )}
          {merge.isPending ? 'Merging…' : `Merge ${chosen.length || ''} PDFs`.trim()}
        </Button>

        {tooFew && !merge.isPending && (
          <p className="text-muted-foreground text-sm">Choose at least two PDFs to merge.</p>
        )}
      </div>

      {merge.isSuccess && <ToolResult outputs={merge.data.outputs} onReset={reset} />}
    </ToolShell>
  )
}
