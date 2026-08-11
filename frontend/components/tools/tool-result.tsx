'use client'

import { CheckCircle2, Download, FileArchive, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button, buttonVariants } from '@/components/ui/button'
import { downloadDocument } from '@/lib/documents'
import { formatBytes, formatPages } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

/**
 * What a finished tool run shows.
 *
 * The result is a document like any other, so this offers the download people
 * came for and a way back to the list, rather than a dead-end "success".
 */
export function ToolResult({ output, onReset }: { output: DocumentSummary; onReset: () => void }) {
  const [isDownloading, setIsDownloading] = useState(false)
  const isArchive = output.mime_type === 'application/zip'
  const Icon = isArchive ? FileArchive : FileText
  const pages = formatPages(output.page_count)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await downloadDocument(output.id, output.original_filename)
    } catch {
      toast.error('That file could not be downloaded.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div
      className="space-y-4 rounded-xl border border-green-600/30 bg-green-600/5 p-5"
      // Announced rather than silently appearing: the button that started this
      // is above the fold, and the result may not be. Named because dnd-kit
      // puts its own status region on the merge page, and two unnamed ones are
      // indistinguishable to anything looking for this panel.
      role="status"
      aria-label="Result"
    >
      <div className="flex items-center gap-2 text-green-700 dark:text-green-500">
        <CheckCircle2 className="size-5" aria-hidden />
        <p className="font-medium">Done</p>
      </div>

      <div className="bg-background flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{output.original_filename}</p>
          <p className="text-muted-foreground text-xs">
            {formatBytes(output.file_size)}
            {pages ? ` · ${pages}` : ''}
            {isArchive ? ' · ZIP archive' : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {isDownloading ? 'Downloading…' : 'Download'}
        </Button>
        <Button variant="outline" onClick={onReset}>
          Start again
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }))}>
          Back to documents
        </Link>
      </div>

      <p className="text-muted-foreground text-xs">
        This file has been saved to your documents, so you can come back for it later.
      </p>
    </div>
  )
}
