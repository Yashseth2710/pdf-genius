import { apiFetch } from '@/lib/api'
import { tokenStore } from '@/lib/auth'
import type {
  CompressInput,
  CompressionResult,
  ImagesToPdfInput,
  MergeInput,
  OrganiseInput,
  SplitInput,
  ToolRun,
} from '@/types/api'

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

/**
 * Make a PDF smaller.
 *
 * A successful run with no outputs is the honest answer that the file could
 * not be made meaningfully smaller — read `compressionOf(run)` for the numbers
 * rather than inferring anything from the empty list.
 */
export async function compressDocument(input: CompressInput): Promise<ToolRun> {
  return apiFetch<ToolRun>('/tools/compress', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(input),
  })
}

/** Bind images into one PDF, one page each, in the order given. */
export async function imagesToPdf(input: ImagesToPdfInput): Promise<ToolRun> {
  return apiFetch<ToolRun>('/tools/images-to-pdf', {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(input),
  })
}

/**
 * The measured sizes a compression run reported, if it reported any.
 *
 * The job carries loosely typed JSON, because every operation records
 * something different there. This narrows it once, here, so no screen has to
 * reach into `job.result` and hope.
 */
export function compressionOf(run: ToolRun): CompressionResult | null {
  const result = run.job.result
  if (typeof result?.original_size !== 'number' || typeof result.final_size !== 'number') {
    return null
  }

  return {
    original_size: result.original_size,
    final_size: result.final_size,
    saved_bytes: typeof result.saved_bytes === 'number' ? result.saved_bytes : 0,
    saved_percent: typeof result.saved_percent === 'number' ? result.saved_percent : 0,
    shrank: result.shrank === true,
  }
}
