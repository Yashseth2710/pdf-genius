import { describe, expect, it } from 'vitest'

import { describeJob, operationLabel } from '@/lib/job-summary'
import type { Job, OperationType } from '@/types/api'

function job(
  operation: OperationType,
  options: Record<string, unknown> = {},
  extra: Partial<Job> = {},
): Job {
  return {
    id: 'job-1',
    operation,
    status: 'COMPLETED',
    document_id: 'doc-1',
    output_document_ids: ['out-1'],
    options,
    result: {},
    error_message: null,
    created_at: '2026-08-14T10:00:00Z',
    completed_at: '2026-08-14T10:00:01Z',
    ...extra,
  }
}

describe('operationLabel', () => {
  it('names each operation the way a person would say it', () => {
    expect(operationLabel('MERGE')).toBe('Merged')
    expect(operationLabel('COMPRESS')).toBe('Compressed')
    expect(operationLabel('ORGANISE')).toBe('Organised')
  })
})

describe('describeJob', () => {
  it('says how many files went into a merge, and what came out', () => {
    const summary = describeJob(
      job('MERGE', { document_ids: ['a', 'b', 'c'], output_name: 'assignment.pdf' }),
    )

    expect(summary).toBe('3 PDFs into assignment.pdf')
  })

  it('describes a split by the ranges that were typed', () => {
    const summary = describeJob(
      job('SPLIT', { mode: 'ranges', ranges: '1-3, 5' }, { output_document_ids: ['a', 'b'] }),
    )

    expect(summary).toBe('pages 1-3, 5 into 2 files')
  })

  it('describes a split into every page', () => {
    const summary = describeJob(
      job('SPLIT', { mode: 'every_page' }, { output_document_ids: ['a', 'b', 'c'] }),
    )

    expect(summary).toBe('every page into 3 files')
  })

  it('describes a split by selected pages', () => {
    expect(describeJob(job('SPLIT', { mode: 'pages', pages: [2, 5, 9] }))).toBe(
      '3 selected pages into one PDF',
    )
  })

  it('says what an organise changed, not just what came out', () => {
    // "9 pages" alone does not say anything happened; "12 pages into 9" does.
    const summary = describeJob(
      job('ORGANISE', { pages: new Array(9).fill({ number: 1 }), source_page_count: 12 }),
    )

    expect(summary).toBe('12 pages into 9')
  })

  it('does not claim a page count changed when it did not', () => {
    const summary = describeJob(
      job('ORGANISE', { pages: new Array(4).fill({ number: 1 }), source_page_count: 4 }),
    )

    expect(summary).toBe('4 pages')
  })

  it('reports what a compression measured, not what it was asked for', () => {
    const summary = describeJob(
      job(
        'COMPRESS',
        { level: 'strong' },
        {
          result: {
            original_size: 4_000_000,
            final_size: 1_000_000,
            saved_percent: 75,
            shrank: true,
          },
        },
      ),
    )

    expect(summary).toBe('strong — 75% smaller (3.8 MB → 977 KB)')
  })

  it('says plainly when a compression could not shrink the file', () => {
    const summary = describeJob(
      job(
        'COMPRESS',
        { level: 'basic' },
        { output_document_ids: [], result: { saved_percent: 0, shrank: false } },
      ),
    )

    expect(summary).toBe('basic — already as small as it goes')
  })

  it('describes images bound into a PDF', () => {
    const summary = describeJob(
      job('CONVERT', {
        direction: 'images_to_pdf',
        document_ids: ['a', 'b'],
        output_name: 'album.pdf',
      }),
    )

    expect(summary).toBe('2 images into album.pdf')
  })

  it('counts one file as a file, not "1 files"', () => {
    expect(describeJob(job('SPLIT', { mode: 'every_page' }, { output_document_ids: ['a'] }))).toBe(
      'every page into 1 file',
    )
  })

  it('says so when a run produced nothing', () => {
    expect(describeJob(job('SPLIT', { mode: 'every_page' }, { output_document_ids: [] }))).toBe(
      'every page into no new files',
    )
  })

  // These options were written by older versions of the app as often as by the
  // current one. A history screen that throws on last month's job is worse than
  // one that says a little less about it.
  it('survives options it does not recognise', () => {
    expect(() => describeJob(job('MERGE', { document_ids: 'not an array' }))).not.toThrow()
    expect(() => describeJob(job('SPLIT', {}))).not.toThrow()
    expect(() => describeJob(job('COMPRESS', { level: 42 }))).not.toThrow()
    expect(() => describeJob(job('ORGANISE', { pages: null }))).not.toThrow()
  })

  it('falls back to counting the outputs for an operation it has no words for', () => {
    expect(describeJob(job('OCR', {}, { output_document_ids: ['a', 'b'] }))).toBe('2 files')
  })
})
