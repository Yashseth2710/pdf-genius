'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileOutput, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { ImageMultiSelect } from '@/components/tools/document-picker'
import { FileOrder } from '@/components/tools/file-order'
import { ToolResult } from '@/components/tools/tool-result'
import { ToolShell, ToolStep } from '@/components/tools/tool-shell'
import { useImageDocuments } from '@/components/tools/use-documents'
import { resolveSelection, useOrderedSelection } from '@/components/tools/use-ordered-selection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ApiError } from '@/lib/api'
import { imagesToPdf } from '@/lib/tools'
import { cn } from '@/lib/utils'
import type { Orientation, PageSize } from '@/types/api'

const MAX_IMAGES = 50

const SIZES: { value: PageSize; title: string; description: string }[] = [
  { value: 'a4', title: 'A4', description: 'Each image is fitted onto an A4 page.' },
  { value: 'letter', title: 'Letter', description: 'Each image is fitted onto a Letter page.' },
  {
    value: 'match',
    title: 'Match the image',
    description: 'Each page is exactly its image — no borders, nothing cropped.',
  },
]

const ORIENTATIONS: { value: Orientation; title: string }[] = [
  { value: 'auto', title: 'Follow each image' },
  { value: 'portrait', title: 'Portrait' },
  { value: 'landscape', title: 'Landscape' },
]

export default function ImagesToPdfPage() {
  const queryClient = useQueryClient()
  const { images, isPending, isError, error, hasOnlyNonImages, refetch } = useImageDocuments()

  const selection = useOrderedSelection()
  const [pageSize, setPageSize] = useState<PageSize>('a4')
  const [orientation, setOrientation] = useState<Orientation>('auto')
  const [outputName, setOutputName] = useState('images.pdf')

  const convert = useMutation({
    mutationFn: imagesToPdf,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
  })

  const chosen = resolveSelection(selection.ids, images)

  function reset() {
    selection.clear()
    setPageSize('a4')
    setOrientation('auto')
    setOutputName('images.pdf')
    convert.reset()
  }

  const tooMany = chosen.length > MAX_IMAGES

  return (
    <ToolShell
      title="Images to PDF"
      description="Turn your photos and scans into one PDF, a page each, in the order you choose."
    >
      <ToolStep step={1} title="Choose your images" description={`Up to ${MAX_IMAGES} at a time.`}>
        <ImageMultiSelect
          documents={images}
          isPending={isPending}
          isError={isError}
          error={error}
          hasOnlyNonImages={hasOnlyNonImages}
          onRetry={() => void refetch()}
          selected={selection.ids}
          onToggle={selection.toggle}
        />
      </ToolStep>

      <ToolStep
        step={2}
        title="Put them in order"
        description="Drag an image, or use the arrows. The first one becomes page 1."
      >
        <FileOrder
          documents={chosen}
          label="Page order"
          emptyMessage="Nothing chosen yet. Tick at least one image above."
          onReorder={selection.reorder}
          onRemove={selection.remove}
        />
      </ToolStep>

      <ToolStep step={3} title="Choose the page">
        <RadioGroup
          value={pageSize}
          onValueChange={(next) => setPageSize(next as PageSize)}
          aria-label="Page size"
        >
          {SIZES.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors',
                pageSize === option.value ? 'border-brand bg-brand-muted/40' : 'hover:bg-muted/40',
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

        {/* Meaningless when every page is the shape of its own image, so it is
            hidden rather than left there doing nothing. */}
        {pageSize !== 'match' && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium">Orientation</p>
            <RadioGroup
              value={orientation}
              onValueChange={(next) => setOrientation(next as Orientation)}
              aria-label="Orientation"
              className="flex flex-wrap gap-2"
            >
              {ORIENTATIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    orientation === option.value
                      ? 'border-brand bg-brand-muted/40'
                      : 'hover:bg-muted/40',
                  )}
                >
                  <RadioGroupItem value={option.value} />
                  {option.title}
                </label>
              ))}
            </RadioGroup>
            <p className="text-muted-foreground text-xs">
              Following each image keeps a landscape photo landscape, so a mixed batch does not end
              up with half of it in a letterbox.
            </p>
          </div>
        )}
      </ToolStep>

      <ToolStep step={4} title="Name the result">
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
            You have chosen {chosen.length} images, and the limit is {MAX_IMAGES}.
          </p>
        )}

        {convert.isError && (
          <p className="text-destructive text-sm" role="alert">
            {convert.error instanceof ApiError
              ? convert.error.message
              : 'Those images could not be combined. Please try again.'}
          </p>
        )}

        <Button
          size="lg"
          disabled={
            chosen.length === 0 || tooMany || convert.isPending || outputName.trim().length === 0
          }
          onClick={() =>
            convert.mutate({
              document_ids: selection.ids,
              page_size: pageSize,
              orientation,
              output_name: outputName.trim(),
            })
          }
        >
          {convert.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <FileOutput aria-hidden />
          )}
          {convert.isPending ? 'Building…' : 'Create PDF'}
        </Button>

        {chosen.length === 0 && (
          <p className="text-muted-foreground text-sm">Choose at least one image.</p>
        )}
      </div>

      {convert.isSuccess && <ToolResult outputs={convert.data.outputs} onReset={reset} />}
    </ToolShell>
  )
}
