'use client'

import { Loader2 } from 'lucide-react'

import { useImageSource } from '@/components/tools/use-image-source'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * One image, filling the screen.
 *
 * A far smaller thing than the PDF viewer next door, and deliberately so: an
 * image has no pages to walk through, and the browser already decodes and
 * scales it better than any canvas we could draw on. It exists at all because
 * a document you cannot look at is a dead end, and exported pages are
 * documents like any other.
 */
export function ImageViewer({
  documentId,
  filename,
  open,
  onClose,
}: {
  documentId: string
  filename: string
  open: boolean
  onClose: () => void
}) {
  const { url, error } = useImageSource(open ? documentId : null)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[92vh] max-w-[min(96vw,1500px)] flex-col gap-3 sm:max-w-[min(96vw,1500px)]"
        aria-describedby={undefined}
      >
        <DialogTitle className="truncate pr-10 text-base">{filename}</DialogTitle>

        <div className="bg-muted/40 flex flex-1 items-center justify-center overflow-auto rounded-lg p-4">
          {error ? (
            <p className="text-muted-foreground text-sm" role="alert">
              {error}
            </p>
          ) : url ? (
            // A blob URL of the user's own file. next/image optimises URLs it
            // can fetch itself, which a blob in this tab is not.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={filename}
              className="max-h-full max-w-full rounded object-contain shadow-lg"
            />
          ) : (
            <Loader2 className="text-muted-foreground size-6 animate-spin" aria-label="Loading" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
