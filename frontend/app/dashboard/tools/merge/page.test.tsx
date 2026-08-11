import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MergePage from '@/app/dashboard/tools/merge/page'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentListPage, DocumentSummary } from '@/types/api'

const listDocuments = vi.fn()
const mergeDocuments = vi.fn()

vi.mock('@/lib/documents', () => ({
  listDocuments: (...args: unknown[]) => listDocuments(...args),
  downloadDocument: vi.fn(),
}))

vi.mock('@/lib/tools', () => ({
  mergeDocuments: (...args: unknown[]) => mergeDocuments(...args),
}))

function doc(id: string, name: string, mime = 'application/pdf'): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: mime,
    file_size: 2048,
    page_count: 3,
    status: 'READY',
    created_at: '2026-08-11T10:00:00Z',
  }
}

const page: DocumentListPage = {
  items: [doc('a', 'cover.pdf'), doc('b', 'body.pdf'), doc('c', 'photo.png', 'image/png')],
  total: 3,
  limit: 100,
  offset: 0,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={0}>
        <MergePage />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

/**
 * Tick a file by name.
 *
 * The checkbox takes its accessible name from the row it sits in, so the name
 * is matched loosely rather than exactly.
 */
async function choose(name: string) {
  await userEvent.click(await screen.findByRole('checkbox', { name: new RegExp(escape(name)) }))
}

function escape(text: string): string {
  return text.replaceAll('.', String.raw`\.`)
}

beforeEach(() => {
  vi.clearAllMocks()
  listDocuments.mockResolvedValue(page)
  mergeDocuments.mockResolvedValue({
    job: { id: 'job-1', operation: 'MERGE', status: 'COMPLETED' },
    outputs: [doc('out', 'merged.pdf')],
  })
})

describe('Merge page', () => {
  it('offers only the PDFs, not every document', async () => {
    renderPage()

    expect(await screen.findByRole('checkbox', { name: /cover\.pdf/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /photo\.png/ })).not.toBeInTheDocument()
  })

  it('will not merge until two files are chosen', async () => {
    renderPage()
    await choose('cover.pdf')

    expect(screen.getByRole('button', { name: /^Merge/ })).toBeDisabled()
    expect(screen.getByText('Choose at least two PDFs to merge.')).toBeInTheDocument()
  })

  it('sends the files in the order they were ticked', async () => {
    renderPage()
    await choose('body.pdf')
    await choose('cover.pdf')

    await userEvent.click(screen.getByRole('button', { name: /^Merge/ }))

    expect(mergeDocuments.mock.calls[0][0]).toEqual({
      document_ids: ['b', 'a'],
      output_name: 'merged.pdf',
    })
  })

  it('sends the order the user rearranged them into', async () => {
    renderPage()
    await choose('cover.pdf')
    await choose('body.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Move body.pdf up' }))
    await userEvent.click(screen.getByRole('button', { name: /^Merge/ }))

    expect(mergeDocuments.mock.calls[0][0].document_ids).toEqual(['b', 'a'])
  })

  it('drops a file that is removed from the order', async () => {
    renderPage()
    await choose('cover.pdf')
    await choose('body.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Remove cover.pdf from the merge' }))

    expect(screen.getByRole('button', { name: /^Merge/ })).toBeDisabled()
  })

  it('uses the name the user typed', async () => {
    renderPage()
    await choose('cover.pdf')
    await choose('body.pdf')

    const field = screen.getByLabelText('File name')
    await userEvent.clear(field)
    await userEvent.type(field, 'assignment.pdf')
    await userEvent.click(screen.getByRole('button', { name: /^Merge/ }))

    expect(mergeDocuments.mock.calls[0][0].output_name).toBe('assignment.pdf')
  })

  it('shows the result with a download once the merge finishes', async () => {
    renderPage()
    await choose('cover.pdf')
    await choose('body.pdf')

    await userEvent.click(screen.getByRole('button', { name: /^Merge/ }))

    const result = await screen.findByRole('status', { name: 'Result' })
    expect(within(result).getByText('merged.pdf')).toBeInTheDocument()
    expect(within(result).getByRole('button', { name: 'Download merged.pdf' })).toBeInTheDocument()
  })

  it('shows the reason a merge failed', async () => {
    const { ApiError } = await import('@/lib/api')
    mergeDocuments.mockRejectedValue(
      new ApiError('PROCESSING_FAILED', "'body.pdf' could not be opened.", 422),
    )
    renderPage()
    await choose('cover.pdf')
    await choose('body.pdf')

    await userEvent.click(screen.getByRole('button', { name: /^Merge/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent("'body.pdf' could not be opened.")
  })

  it('tells someone with no PDFs where to start', async () => {
    listDocuments.mockResolvedValue({ ...page, items: [], total: 0 })
    renderPage()

    expect(await screen.findByText('Nothing to work with yet')).toBeInTheDocument()
  })

  it('says so when there are documents but none are PDFs', async () => {
    listDocuments.mockResolvedValue({ ...page, items: [doc('c', 'photo.png', 'image/png')] })
    renderPage()

    expect(await screen.findByText('No PDFs yet')).toBeInTheDocument()
  })
})
