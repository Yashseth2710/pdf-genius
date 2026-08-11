'use client'

import { CloudUpload, FileWarning, Loader2, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { uploadDocument } from '@/lib/documents'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DocumentSummary } from '@/types/api'

const MAX_BYTES = 25 * 1024 * 1024
const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

interface Upload {
  id: string
  file: File
  percent: number
  error: string | null
}

export function UploadZone({ onUploaded }: { onUploaded: (document: DocumentSummary) => void }) {
  const [uploads, setUploads] = useState<Upload[]>([])

  const update = useCallback((id: string, patch: Partial<Upload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    )
  }, [])

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      // Files the browser rejected never reach the server, but the person
      // still needs to know why nothing happened.
      setUploads((current) => [
        ...current,
        ...rejected.map((rejection) => ({
          id: crypto.randomUUID(),
          file: rejection.file,
          percent: 0,
          error:
            rejection.errors[0]?.code === 'file-too-large'
              ? `Larger than ${formatBytes(MAX_BYTES)}`
              : 'That file type is not supported',
        })),
      ])

      for (const file of accepted) {
        const id = crypto.randomUUID()
        setUploads((current) => [...current, { id, file, percent: 0, error: null }])

        try {
          const document = await uploadDocument(file, {
            onProgress: (percent) => update(id, { percent }),
          })
          onUploaded(document)
          // Drop the row once it has landed in the list below.
          setUploads((current) => current.filter((upload) => upload.id !== id))
        } catch (error) {
          update(id, {
            error: error instanceof ApiError ? error.message : 'Upload failed. Please try again.',
          })
        }
      }
    },
    [onUploaded, update],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxSize: MAX_BYTES,
  })

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          isDragActive ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/40',
        )}
      >
        <input {...getInputProps()} aria-label="Choose files to upload" />
        <CloudUpload
          className={cn('mb-3 size-8', isDragActive ? 'text-primary' : 'text-muted-foreground')}
          aria-hidden
        />
        <p className="font-medium">
          {isDragActive ? 'Drop them here' : 'Drag files here, or click to choose'}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          PDF, JPG or PNG — up to {formatBytes(MAX_BYTES)} each
        </p>
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map((upload) => (
            <li key={upload.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              {upload.error ? (
                <FileWarning className="text-destructive size-4 shrink-0" aria-hidden />
              ) : (
                <Loader2
                  className="text-muted-foreground size-4 shrink-0 animate-spin"
                  aria-hidden
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{upload.file.name}</p>
                {upload.error ? (
                  <p className="text-destructive text-xs" role="alert">
                    {upload.error}
                  </p>
                ) : (
                  <div
                    className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
                    role="progressbar"
                    aria-valuenow={upload.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${upload.file.name}`}
                  >
                    <div
                      className="bg-primary h-full transition-[width] duration-200"
                      style={{ width: `${upload.percent}%` }}
                    />
                  </div>
                )}
              </div>

              {upload.error && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Dismiss ${upload.file.name}`}
                  onClick={() =>
                    setUploads((current) => current.filter((item) => item.id !== upload.id))
                  }
                >
                  <X aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
