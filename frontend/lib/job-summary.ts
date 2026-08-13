import { formatBytes } from '@/lib/format'
import type { Job, OperationType } from '@/types/api'

/**
 * What a history entry says it did.
 *
 * A job stores what it was *asked* to do as loose JSON, because every operation
 * takes different settings. Turning that back into a sentence is done here,
 * once, rather than in the row component: it is the only part of the history
 * screen with any real logic in it, and this way it can be tested without a
 * browser.
 *
 * Every reader is defensive about the shape it finds. These options were
 * written by an older version of the app as often as by the current one, and a
 * history screen that throws on a job from last month is worse than one that
 * says a little less about it.
 */

/** The name of each operation, as a person would say it. */
const OPERATION_LABELS: Record<OperationType, string> = {
  MERGE: 'Merged',
  SPLIT: 'Split',
  ORGANISE: 'Organised',
  COMPRESS: 'Compressed',
  CONVERT: 'Converted',
  ROTATE: 'Rotated',
  EXTRACT: 'Extracted',
  WATERMARK: 'Watermarked',
  OCR: 'Read text from',
}

export function operationLabel(operation: OperationType): string {
  return OPERATION_LABELS[operation] ?? 'Processed'
}

/** A short line describing what the run actually did. */
export function describeJob(job: Job): string {
  switch (job.operation) {
    case 'MERGE':
      return describeMerge(job)
    case 'SPLIT':
      return describeSplit(job)
    case 'ORGANISE':
      return describeOrganise(job)
    case 'COMPRESS':
      return describeCompress(job)
    case 'CONVERT':
      return describeConvert(job)
    default:
      return countOutputs(job)
  }
}

function describeMerge(job: Job): string {
  const inputs = asArray(job.options.document_ids).length
  const name = asString(job.options.output_name) ?? outputName(job)
  const from = inputs > 0 ? `${inputs} PDFs` : 'several PDFs'
  return name ? `${from} into ${name}` : from
}

function describeSplit(job: Job): string {
  const mode = asString(job.options.mode)
  if (mode === 'ranges') {
    const ranges = asString(job.options.ranges)
    return ranges ? `pages ${ranges} into ${countOutputs(job)}` : countOutputs(job)
  }
  if (mode === 'pages') {
    const pages = asArray(job.options.pages).length
    return pages > 0 ? `${pages} selected ${plural(pages, 'page')} into one PDF` : countOutputs(job)
  }
  if (mode === 'every_page') return `every page into ${countOutputs(job)}`
  return countOutputs(job)
}

function describeOrganise(job: Job): string {
  const kept = asArray(job.options.pages).length
  const before = asNumber(job.options.source_page_count)
  if (kept === 0) return countOutputs(job)
  // "12 pages into 9" says what happened; "9 pages" alone does not.
  if (before !== null && before !== kept) return `${before} pages into ${kept}`
  return `${kept} ${plural(kept, 'page')}`
}

function describeCompress(job: Job): string {
  const level = asString(job.options.level) ?? 'balanced'
  const saved = asNumber(job.result.saved_percent)
  const shrank = job.result.shrank === true

  if (!shrank) return `${level} — already as small as it goes`

  const from = asNumber(job.result.original_size)
  const to = asNumber(job.result.final_size)
  const sizes = from !== null && to !== null ? ` (${formatBytes(from)} → ${formatBytes(to)})` : ''
  return saved !== null ? `${level} — ${Math.round(saved)}% smaller${sizes}` : level
}

function describeConvert(job: Job): string {
  if (asString(job.options.direction) === 'images_to_pdf') {
    const images = asArray(job.options.document_ids).length
    const name = outputName(job)
    const from = images > 0 ? `${images} ${plural(images, 'image')}` : 'images'
    return name ? `${from} into ${name}` : `${from} into one PDF`
  }
  return countOutputs(job)
}

/** "3 files", or "nothing" for a run that produced none. */
function countOutputs(job: Job): string {
  const count = job.output_document_ids.length
  if (count === 0) return 'no new files'
  return `${count} ${plural(count, 'file')}`
}

function outputName(job: Job): string | null {
  return asString(job.options.output_name)
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
