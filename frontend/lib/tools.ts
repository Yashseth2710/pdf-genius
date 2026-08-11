import { apiFetch } from '@/lib/api'
import { tokenStore } from '@/lib/auth'
import type { MergeInput, SplitInput, ToolRun } from '@/types/api'

function authHeader(): Record<string, string> {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Merge several PDFs into one.
 *
 * The order of `document_ids` is the order the pages come out in, so it is the
 * order the user arranged them and not something to sort on the way past.
 */
export async function mergeDocuments(input: MergeInput): Promise<ToolRun> {
  return apiFetch<ToolRun>('/tools/merge', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(input),
  })
}

/** Split one PDF by ranges, into every page, or into a selection of pages. */
export async function splitDocument(input: SplitInput): Promise<ToolRun> {
  return apiFetch<ToolRun>('/tools/split', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(input),
  })
}
