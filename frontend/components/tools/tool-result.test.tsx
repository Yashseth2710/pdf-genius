import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToolResult } from '@/components/tools/tool-result'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentSummary } from '@/types/api'

const downloadDocument = vi.fn()
const downloadArchive = vi.fn()

vi.mock('@/lib/documents', () => ({
  downloadDocument: (...args: unknown[]) => downloadDocument(...args),
  downloadArchive: (...args: unknown[]) => downloadArchive(...args),
}))

function doc(id: string, name: string, pageCount = 2): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: 'application/pdf',
    file_size: 1024,
    page_count: pageCount,
    status: 'READY',
    created_at: '2026-08-12T10:00:00Z',
  }
}

function renderResult(outputs: DocumentSummary[], archiveName?: string) {
  render(
    <TooltipProvider delay={0}>
      <ToolResult outputs={outputs} onReset={vi.fn()} archiveName={archiveName} />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ToolResult', () => {
  it('lists a single result without offering a bundle', () => {
    renderResult([doc('a', 'merged.pdf')])

    expect(screen.getByText('merged.pdf')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download all/ })).not.toBeInTheDocument()
  })

  it('lists every result of a split, in order', () => {
    renderResult([
      doc('a', 'report-1-3.pdf', 3),
      doc('b', 'report-5.pdf', 1),
      doc('c', 'report-8-10.pdf', 3),
    ])

    const names = screen.getAllByRole('listitem').map((row) => row.textContent)
    expect(names[0]).toContain('report-1-3.pdf')
    expect(names[2]).toContain('report-8-10.pdf')
    expect(screen.getByText('Done. 3 files.')).toBeInTheDocument()
  })

  it('gives every result its own download', async () => {
    renderResult([doc('a', 'report-1-3.pdf'), doc('b', 'report-5.pdf')])

    await userEvent.click(screen.getByRole('button', { name: 'Download report-5.pdf' }))

    expect(downloadDocument).toHaveBeenCalledWith('b', 'report-5.pdf')
  })

  it('gives every result its own preview', () => {
    // The reason results are separate documents rather than one archive:
    // each of them can be looked at.
    renderResult([doc('a', 'report-1-3.pdf'), doc('b', 'report-5.pdf')])

    expect(screen.getByRole('button', { name: 'Preview report-1-3.pdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview report-5.pdf' })).toBeInTheDocument()
  })

  it('bundles several results into one download on request', async () => {
    renderResult([doc('a', 'report-1-3.pdf'), doc('b', 'report-5.pdf')], 'report-split.zip')

    await userEvent.click(screen.getByRole('button', { name: 'Download all 2' }))

    expect(downloadArchive).toHaveBeenCalledWith(['a', 'b'], 'report-split.zip')
  })

  it('says the results were saved, not just produced', () => {
    renderResult([doc('a', 'one.pdf'), doc('b', 'two.pdf')])

    expect(screen.getByText(/These files have been saved to your documents/)).toBeInTheDocument()
  })

  it('renders nothing when a run produced no files', () => {
    const { container } = render(
      <TooltipProvider delay={0}>
        <ToolResult outputs={[]} onReset={vi.fn()} />
      </TooltipProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
