'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Combine, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { MergeOrder } from '@/components/tools/merge-order'
import { PdfMultiSelect } from '@/components/tools/pdf-picker'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { usePdfDocuments } from '@/components/tools/use-pdfs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { mergeDocuments } from '@/lib/tools'
import type { DocumentSummary } from '@/types/api'

const MAX_FILES = 20

export default function MergePage() {
  const queryClient = useQueryClient()
  const { pdfs, isPending, isError, error, hasOnlyNonPdfs, refetch } = usePdfDocuments()

  // The selection is held as an ordered list of ids rather than a Set: the
  // order is the whole point of this tool, and a Set does not promise one.
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [outputName, setOutputName] = useState('merged.pdf')

  const merge = useMutation({
    mutationFn: mergeDocuments,
    onSuccess: () => {
      // The result is a document too, so every list of them is now stale.
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  // Resolved every render from the ids, so a document deleted in another tab
  // simply drops out instead of leaving a row pointing at nothing.
  const chosen = selectedIds
    .map((id) => pdfs.find((item) => item.id === id))
    .filter((item): item is DocumentSummary => item !== undefined)

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function reorder(from: number, to: number) {
    setSelectedIds((current) => {
      if (to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function reset() {
    setSelectedIds([])
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
          selected={selectedIds}
          onToggle={toggle}
        />
      </ToolStep>

      <ToolStep
        step={2}
        title="Put them in order"
        description="Drag a file, or use the arrows. The first one becomes page 1."
      >
        <MergeOrder
          documents={chosen}
          onReorder={reorder}
          onRemove={(id) => setSelectedIds((current) => current.filter((item) => item !== id))}
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
              document_ids: selectedIds,
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
