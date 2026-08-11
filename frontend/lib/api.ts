import type { ApiEnvelope } from '@/types/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1'

/**
 * A failed request, carrying the backend's error code so callers can branch on
 * it, and a message that is already safe to show a user.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'
const MALFORMED_MESSAGE = 'The server sent an unexpected response.'

/**
 * Calls the backend and unwraps the envelope, returning `data` directly.
 * Anything that is not a success throws an {@link ApiError}, so components
 * only ever deal with the happy path or a catch block.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Let the browser set its own multipart boundary for uploads; forcing
  // application/json here would corrupt the request body.
  const isFormData = init.body instanceof FormData
  const headers = new Headers(init.headers)
  if (!isFormData && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('NETWORK_ERROR', NETWORK_MESSAGE, 0)
  }

  let body: ApiEnvelope<T>
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError('INVALID_RESPONSE', MALFORMED_MESSAGE, response.status)
  }

  if (!body || typeof body !== 'object' || !('success' in body)) {
    throw new ApiError('INVALID_RESPONSE', MALFORMED_MESSAGE, response.status)
  }

  if (body.success === false) {
    throw new ApiError(body.error.code, body.error.message, response.status)
  }

  if (!response.ok) {
    throw new ApiError('HTTP_ERROR', MALFORMED_MESSAGE, response.status)
  }

  return body.data
}
