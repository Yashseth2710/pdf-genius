import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from '@/lib/api'

function mockFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as Response

  const spy = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('unwraps the envelope and returns data', async () => {
    mockFetch({ success: true, data: { status: 'ok', version: '0.1.0' } })

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok', version: '0.1.0' })
  })

  it('throws an ApiError carrying the code the backend sent', async () => {
    mockFetch(
      { success: false, error: { code: 'INVALID_FILE', message: 'Not a valid PDF.' } },
      { ok: false, status: 422 },
    )

    const error = await apiFetch('/pdf/merge').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'INVALID_FILE', message: 'Not a valid PDF.', status: 422 })
  })

  it('reports a friendly message when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = (await apiFetch('/health').catch((e: unknown) => e)) as ApiError

    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.message).toContain('Could not reach the server')
  })

  it('rejects a response that is not the agreed envelope', async () => {
    mockFetch({ unexpected: true })

    await expect(apiFetch('/health')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('sends JSON by default', async () => {
    const spy = mockFetch({ success: true, data: null })

    await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com' }) })

    const headers = spy.mock.calls[0][1].headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('leaves uploads alone so the browser sets the multipart boundary', async () => {
    const spy = mockFetch({ success: true, data: null })
    const form = new FormData()
    form.append('file', new Blob(['x']), 'a.pdf')

    await apiFetch('/documents/upload', { method: 'POST', body: form })

    const headers = spy.mock.calls[0][1].headers as Headers
    expect(headers.has('Content-Type')).toBe(false)
  })
})
