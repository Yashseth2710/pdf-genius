'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RotateCw, Save, Undo2 } from 'lucide-react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useState } from 'react'

import { PageGrid } from '@/components/tools/page-grid'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolStep } from '@/components/tools/tool-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import {
  describe,
  initialPlan,
  isChanged,
  keptPages,
  moveByKey,
  rotate,
  rotateAll,
  toRequest,
  toggleRemoved,
  type PlanEntry,
} from '@/lib/page-plan'
import { organiseDocument } from '@/lib/tools'

/**
 * The editing half of the organiser.
 *
 * Split out so the caller can mount it with `key={documentId}`: picking a
 * different document should start from a clean plan, and remounting is React's
 * own answer to that. Deriving it inside an effect instead would mean writing
 * state from an effect and a render with a stale plan in it.
 */
export function PageOrganiser({
  documentId,
  filename,
  document,
  pageCount,
}: {
  documentId: string
  filename: string
  document: PDFDocumentProxy | null
  pageCount: number
}) {
  const queryClient = useQueryClient()
  const [plan, setPlan] = useState<PlanEntry[]>(() => initialPlan(pageCount))
  const [outputName, setOutputName] = useState(() => suggestName(filename))

  const organise = useMutation({
    mutationFn: organiseDocument,
    onSuccess: () => {
      // The result is a document too, so every list of them is now stale.
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const kept = keptPages(plan)
  const changed = isChanged(plan)

  if (organise.isSuccess) {
    return (
      <ToolResult
        output={organise.data.output}
        onReset={() => {
          setPlan(initialPlan(pageCount))
          organise.reset()
        }}
      />
    )
  }

  return (
    <>
      <ToolStep
        step={2}
        title="Arrange the pages"
        description="Drag a page to move it, or use the buttons on each card."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPlan(rotateAll(plan, 90))}>
              <RotateCw aria-hidden />
              Turn every page
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPlan(initialPlan(pageCount))}
              disabled={!changed}
            >
              <Undo2 aria-hidden />
              Start over
            </Button>
            <p className="text-muted-foreground ml-auto text-sm" role="status">
              {describe(plan, pageCount)}
            </p>
          </div>

          <PageGrid
            document={document}
            documentId={documentId}
            filename={filename}
            plan={plan}
            onMove={(key, to) => setPlan((current) => moveByKey(current, key, to))}
            onRotate={(key, degrees) => setPlan((current) => rotate(current, key, degrees))}
            onToggleRemoved={(key) => setPlan((current) => toggleRemoved(current, key))}
          />
        </div>
      </ToolStep>

      <ToolStep step={3} title="Save as a new document">
        <div className="max-w-sm space-y-2">
          <Label htmlFor="output-name">File name</Label>
          <Input
            id="output-name"
            value={outputName}
            onChange={(event) => setOutputName(event.target.value)}
            maxLength={200}
          />
          <p className="text-muted-foreground text-xs">The original is left exactly as it was.</p>
        </div>
      </ToolStep>

      <div className="space-y-4 border-t pt-6">
        {organise.isError && (
          <p className="text-destructive text-sm" role="alert">
            {organise.error instanceof ApiError
              ? organise.error.message
              : 'Those pages could not be saved. Please try again.'}
          </p>
        )}

        <Button
          size="lg"
          disabled={
            !changed || kept.length === 0 || organise.isPending || outputName.trim().length === 0
          }
          onClick={() =>
            organise.mutate({
              document_id: documentId,
              pages: toRequest(plan),
              output_name: outputName.trim(),
            })
          }
        >
          {organise.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Save aria-hidden />
          )}
          {organise.isPending
            ? 'Saving…'
            : `Save ${kept.length} ${kept.length === 1 ? 'page' : 'pages'}`}
        </Button>

        {kept.length === 0 && (
          <p className="text-destructive text-sm" role="alert">
            Every page is removed. Put at least one back.
          </p>
        )}
        {kept.length > 0 && !changed && !organise.isPending && (
          <p className="text-muted-foreground text-sm">
            Nothing has changed yet, so there is nothing to save.
          </p>
        )}
      </div>
    </>
  )
}

/** "report.pdf" becomes "report-organised.pdf", matching what the API would pick. */
function suggestName(filename: string): string {
  return `${filename.replace(/\.pdf$/i, '')}-organised.pdf`
}
