'use client'

import { useCallback, useState } from 'react'

import type { DocumentSummary } from '@/types/api'

/**
 * A selection of documents where the order matters.
 *
 * Held as a list of ids rather than a Set: the order is the whole point for
 * both tools that use this — it decides which PDF becomes page 1 in a merge,
 * and which photo becomes page 1 in an album — and a Set does not promise one.
 *
 * Ticking a file appends it, so the order is the order the user built up
 * rather than the order the list happened to be in.
 */
export function useOrderedSelection() {
  const [ids, setIds] = useState<string[]>([])

  const toggle = useCallback((id: string) => {
    setIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    setIds((current) => {
      if (to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setIds((current) => current.filter((item) => item !== id))
  }, [])

  const clear = useCallback(() => setIds([]), [])

  return { ids, toggle, reorder, remove, clear }
}

/**
 * The chosen documents, in the chosen order.
 *
 * Resolved from the ids on every render rather than stored, so a document
 * deleted in another tab simply drops out of the list instead of leaving a row
 * pointing at nothing.
 */
export function resolveSelection(ids: string[], available: DocumentSummary[]): DocumentSummary[] {
  return ids
    .map((id) => available.find((item) => item.id === id))
    .filter((item): item is DocumentSummary => item !== undefined)
}
