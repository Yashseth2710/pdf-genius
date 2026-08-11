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

/**
 * Uploads one file, reporting progress as it goes.
 *
 * Uses XMLHttpRequest rather than fetch: fetch cannot report upload progress
 * in any browser we target, and a progress bar that jumps from 0 to 100 is
 * worse than none on a 20MB file over a slow connection.
 */
export function uploadDocument(
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
  const response = await fetch(`${API_URL}/documents/${id}/download`, {
    headers: authHeader(),
  })

  if (!response.ok) {
    throw new ApiError('DOWNLOAD_FAILED', 'That file could not be downloaded.', response.status)
  }

  const blob = await response.blob()
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
