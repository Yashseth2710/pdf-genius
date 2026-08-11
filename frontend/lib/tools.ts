import { apiFetch } from '@/lib/api'
import { tokenStore } from '@/lib/auth'
import type { MergeInput, OrganiseInput, SplitInput, ToolRun } from '@/types/api'

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

/**
 * Rebuild a document from the pages the user kept, in their order.
 *
 * One request rather than three, because rotating, reordering and deleting are
 * one edit as far as the user is concerned — and one job in their history.
 */
export async function organiseDocument(input: OrganiseInput): Promise<ToolRun> {
  return apiFetch<ToolRun>('/tools/organise', {
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
