'use client'

import { useEffect, useState } from 'react'

import { fetchDocumentBlob } from '@/lib/documents'

interface ImageSource {
  /** An object URL for the image, or null while loading or after a failure. */
  url: string | null
  isLoading: boolean
  error: string | null
}

/**
 * Downloads an image document and makes a URL a browser can show it from.
 *
 * Fetched rather than linked to, because the download endpoint needs an
 * Authorization header and `<img src>` would be sent without one.
 *
 * Not a TanStack Query: an object URL pins the whole file in memory until it
 * is revoked, so it has to be released when the component goes away. A cache
 * that outlived the component would hold on to every image ever opened.
 *
 * Pass null to load nothing, which is what keeps a preview button lazy.
 */
export function useImageSource(documentId: string | null): ImageSource {
  const [outcome, setOutcome] = useState<{ id: string; url: string | null; error: string | null }>({
    id: '',
    url: null,
    error: null,
  })

  useEffect(() => {
    if (!documentId) return

    let cancelled = false
    let created: string | null = null

    void fetchDocumentBlob(documentId)
      .then((blob) => {
        created = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(created)
          return
        }
        setOutcome({ id: documentId, url: created, error: null })
      })
      .catch(() => {
        if (!cancelled) {
          setOutcome({ id: documentId, url: null, error: 'That image could not be opened.' })
        }
      })

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [documentId])

  if (!documentId) return { url: null, isLoading: false, error: null }

  // "Loading" is derived rather than stored: it is simply holding no outcome
  // for the document being asked about, which avoids setting state inside the
  // effect.
  const current = outcome.id === documentId ? outcome : null

  return {
    url: current?.url ?? null,
    isLoading: current === null,
    error: current?.error ?? null,
  }
}
