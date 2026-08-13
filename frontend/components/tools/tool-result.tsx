'use client'

import { Archive, CheckCircle2, Download, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { PreviewButton } from '@/components/tools/preview-button'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { downloadArchive, downloadDocument } from '@/lib/documents'
import { formatBytes, formatPages } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

/**
 * What a finished tool run shows.
 *
 * Every result is a document like any other — several of them, for a split —
 * so each one gets a preview and a download of its own rather than being
 * bundled into an archive the user then has to unpack. "Download all" zips
 * them on the way out for anyone who does want one file.
 */
export function ToolResult({
  outputs,
  onReset,
  archiveName,
}: {
  outputs: DocumentSummary[]
  onReset: () => void
  /** Name for the bundle when several results are downloaded together. */
  archiveName?: string
}) {
  const [isArchiving, setIsArchiving] = useState(false)

  if (outputs.length === 0) return null

  const many = outputs.length > 1

  async function handleDownloadAll() {
    setIsArchiving(true)
    try {
      await downloadArchive(
        outputs.map((output) => output.id),
        archiveName ?? 'documents.zip',
      )
    } catch {
      toast.error('Those files could not be downloaded.')
    } finally {
      setIsArchiving(false)
    }
  }

  return (
    <div
      // Not a green-tinted panel. A whole card washed in a status colour is
      // shouting a thing the tick and the word "Done" already say, and it left
      // the result rows sitting as bordered cards inside a bordered card.
      className="bg-muted/40 space-y-4 rounded-lg border p-5"
      // Announced rather than silently appearing: the button that started this
      // is above the fold, and the result may not be. Named because dnd-kit
      // puts its own status region on the merge page, and two unnamed ones are
      // indistinguishable to anything looking for this panel.
      role="status"
      aria-label="Result"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="text-success size-5" aria-hidden />
        <p className="font-medium">{many ? `Done. ${outputs.length} files.` : 'Done'}</p>
      </div>

      <ul className="border-t">
        {outputs.map((output) => (
          <ResultRow key={output.id} output={output} />
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {many && (
          <Button onClick={handleDownloadAll} disabled={isArchiving}>
            {isArchiving ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Archive aria-hidden />
            )}
            {isArchiving ? 'Preparing…' : `Download all ${outputs.length}`}
          </Button>
        )}
        <Button variant="outline" onClick={onReset}>
          Start again
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }))}>
          Back to documents
        </Link>
      </div>

      <p className="text-muted-foreground text-xs">
        {many ? 'These files have' : 'This file has'} been saved to your documents, so you can come
        back for {many ? 'them' : 'it'} later, or use {many ? 'them' : 'it'} in another tool.
      </p>
    </div>
  )
}

function ResultRow({ output }: { output: DocumentSummary }) {
  const [isDownloading, setIsDownloading] = useState(false)
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
    <li className="flex items-center gap-3 border-b py-2.5">
      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{output.original_filename}</p>
        <p className="text-muted-foreground tabular mt-0.5 text-xs">
          {formatBytes(output.file_size)}
          {pages ? ` · ${pages}` : ''}
        </p>
      </div>

      <PreviewButton
        documentId={output.id}
        filename={output.original_filename}
        mimeType={output.mime_type}
      />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDownload}
              disabled={isDownloading}
            />
          }
          aria-label={`Download ${output.original_filename}`}
        >
          {isDownloading ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
        </TooltipTrigger>
        <TooltipContent>{isDownloading ? 'Downloading…' : 'Download'}</TooltipContent>
      </Tooltip>
    </li>
  )
}
