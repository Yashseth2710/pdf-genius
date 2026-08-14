import { ApiError, apiFetch } from '@/lib/api'
import { tokenStore } from '@/lib/auth'
import type { ApiEnvelope, DocumentListPage, DocumentSummary } from '@/types/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

function authHeader(): Record<string, string> {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function listDocuments(limit = 20, offset = 0): Promise<DocumentListPage> {
  return apiFetch<DocumentListPage>(`/documents?limit=${limit}&offset=${offset}`, {
    headers: authHeader(),
  })
}

export async function getDocument(id: string): Promise<DocumentSummary> {
  return apiFetch<DocumentSummary>(`/documents/${id}`, { headers: authHeader() })
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch(`/documents/${id}`, { method: 'DELETE', headers: authHeader() })
}

type UploadOptions = { onProgress?: (percent: number) => void; signal?: AbortSignal }

/**
 * Uploads one file, by whichever route this deployment supports.
 *
 * Two routes exist because the serverless host caps request bodies at 4.5MB,
 * well under the 25MB a user is allowed to upload. Where that cap applies the
 * browser writes to object storage itself and the API only records the result;
 * where it does not — a normal server, and local development — the file goes
 * through the API as it always has.
 */
export function uploadDocument(file: File, options: UploadOptions = {}): Promise<DocumentSummary> {
  return DIRECT_UPLOADS ? uploadDirect(file, options) : uploadThroughApi(file, options)
}

const DIRECT_UPLOADS = process.env.NEXT_PUBLIC_DIRECT_UPLOADS === 'true'

/**
 * Browser straight to Blob, then a note to the API saying where it landed.
 *
 * Three steps rather than one, and each is a place this can be refused: the
 * API reserves a key and can say no on quota; the token route confirms the key
 * belongs to whoever is asking; and the record call reads the bytes that
 * actually arrived before it writes a row. Nothing trusts the step before it.
 */
async function uploadDirect(
  file: File,
  { onProgress, signal }: UploadOptions,
): Promise<DocumentSummary> {
  const { upload } = await import('@vercel/blob/client')

  const ticket = await apiFetch<{ key: string; max_bytes: number }>('/documents/upload-ticket', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, size: file.size }),
  })

  await upload(ticket.key, file, {
    access: 'public',
    handleUploadUrl: '/api/blob/upload',
    clientPayload: tokenStore.get() ?? '',
    abortSignal: signal,
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  })

  return apiFetch<DocumentSummary>('/documents/record', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: ticket.key, filename: file.name }),
  })
}

/**
 * Uploads one file through the API, reporting progress as it goes.
 *
 * Uses XMLHttpRequest rather than fetch: fetch cannot report upload progress
 * in any browser we target, and a progress bar that jumps from 0 to 100 is
 * worse than none on a 20MB file over a slow connection.
 */
function uploadThroughApi(
  file: File,
  { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<DocumentSummary> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)

    const request = new XMLHttpRequest()
    request.open('POST', `${API_URL}/documents/upload`)

    const token = tokenStore.get()
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`)

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })

    request.addEventListener('load', () => {
      let body: ApiEnvelope<DocumentSummary>
      try {
        body = JSON.parse(request.responseText) as ApiEnvelope<DocumentSummary>
      } catch {
        reject(
          new ApiError(
            'INVALID_RESPONSE',
            'The server sent an unexpected response.',
            request.status,
          ),
        )
        return
      }

      if (body.success) {
        resolve(body.data)
      } else {
        reject(new ApiError(body.error.code, body.error.message, request.status))
      }
    })

    request.addEventListener('error', () => {
      reject(new ApiError('NETWORK_ERROR', 'Could not reach the server. Check your connection.', 0))
    })

    request.addEventListener('abort', () => {
      reject(new ApiError('CANCELLED', 'Upload cancelled.', 0))
    })

    signal?.addEventListener('abort', () => request.abort())

    request.send(form)
  })
}

/**
 * Downloads through fetch rather than a plain link, because the endpoint needs
 * an Authorization header. The blob is handed to a temporary anchor so the
 * browser saves it under the filename the server chose.
 */
export async function downloadDocument(id: string, filename: string): Promise<void> {
  await saveBlob(await fetchDocumentBlob(id), filename)
}

/**
 * The bytes of a stored document.
 *
 * Fetched rather than linked to, because the endpoint needs an Authorization
 * header — an `<img src>` or an `<a href>` would be sent without one.
 */
export async function fetchDocumentBlob(id: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: authHeader(),
  })

  if (!response.ok) {
    throw new ApiError('DOWNLOAD_FAILED', 'That file could not be downloaded.', response.status)
  }

  return response.blob()
}

/**
 * Downloads several documents as one zip.
 *
 * The archive is built by the server as it responds and never stored: it is a
 * way of delivering files, not a document. Nothing in the user's list is ever
 * an archive, which is what keeps every result previewable and reusable.
 */
export async function downloadArchive(ids: string[], filename: string): Promise<void> {
  const response = await fetch(`${API_URL}/documents/archive`, {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_ids: ids, name: filename }),
  })

  if (!response.ok) {
    throw new ApiError('DOWNLOAD_FAILED', 'Those files could not be downloaded.', response.status)
  }

  await saveBlob(await response.blob(), filename)
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Releasing immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
