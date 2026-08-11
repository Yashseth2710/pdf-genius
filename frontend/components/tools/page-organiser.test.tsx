import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PageOrganiser } from '@/components/tools/page-organiser'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentSummary } from '@/types/api'

const organiseDocument = vi.fn()

vi.mock('@/lib/tools', () => ({
  organiseDocument: (...args: unknown[]) => organiseDocument(...args),
}))

vi.mock('@/lib/documents', () => ({
  downloadDocument: vi.fn(),
}))

// The thumbnail needs a canvas and a PDF.js worker, neither of which exists in
// jsdom. What it draws is covered end to end; what these tests care about is
// the editing, so it is replaced with a marker.
vi.mock('@/components/tools/page-thumbnail', () => ({
  PageThumbnail: ({ pageNumber, rotation }: { pageNumber: number; rotation: number }) => (
    <div data-testid={`thumb-${pageNumber}`} data-rotation={rotation} />
  ),
}))

const output: DocumentSummary = {
  id: 'out',
  original_filename: 'report-organised.pdf',
  mime_type: 'application/pdf',
  file_size: 2048,
  page_count: 2,
  status: 'READY',
  created_at: '2026-08-12T10:00:00Z',
}

function renderOrganiser(pageCount = 3) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={0}>
        <PageOrganiser
          documentId="doc-1"
          filename="report.pdf"
          document={null}
          pageCount={pageCount}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

function saveButton() {
  return screen.getByRole('button', { name: /^Save/ })
}

beforeEach(() => {
  vi.clearAllMocks()
  organiseDocument.mockResolvedValue({ job: { id: 'job-1' }, outputs: [output] })
})

describe('PageOrganiser', () => {
  it('shows one card per page', () => {
    renderOrganiser(4)

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('suggests a name that does not overwrite the original', () => {
    renderOrganiser()

    expect(screen.getByLabelText('File name')).toHaveValue('report-organised.pdf')
  })

  it('cannot be saved until something changes', () => {
    renderOrganiser()

    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('Nothing has changed yet, so there is nothing to save.')).toBeVisible()
  })

  it('sends the kept pages in order', async () => {
    renderOrganiser(3)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 2' }))
    await userEvent.click(saveButton())

    expect(organiseDocument.mock.calls[0][0]).toEqual({
      document_id: 'doc-1',
      pages: [
        { number: 1, rotation: 0 },
        { number: 3, rotation: 0 },
      ],
      output_name: 'report-organised.pdf',
    })
  })

  it('sends rotations with the pages they belong to', async () => {
    renderOrganiser(2)

    await userEvent.click(screen.getByRole('button', { name: 'Turn Page 2 right' }))
    await userEvent.click(saveButton())

    expect(organiseDocument.mock.calls[0][0].pages).toEqual([
      { number: 1, rotation: 0 },
      { number: 2, rotation: 90 },
    ])
  })

  it('sends the order the user moved pages into', async () => {
    renderOrganiser(3)

    await userEvent.click(screen.getByRole('button', { name: 'Move Page 3 earlier' }))
    await userEvent.click(saveButton())

    expect(
      organiseDocument.mock.calls[0][0].pages.map((page: { number: number }) => page.number),
    ).toEqual([1, 3, 2])
  })

  it('turns every page at once', async () => {
    renderOrganiser(3)

    await userEvent.click(screen.getByRole('button', { name: 'Turn every page' }))
    await userEvent.click(saveButton())

    expect(
      organiseDocument.mock.calls[0][0].pages.every(
        (page: { rotation: number }) => page.rotation === 90,
      ),
    ).toBe(true)
  })

  it('puts a removed page back', async () => {
    renderOrganiser(2)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    expect(saveButton()).toHaveTextContent('Save 1 page')

    await userEvent.click(screen.getByRole('button', { name: 'Put Page 1 back' }))

    expect(saveButton()).toHaveTextContent('Save 2 pages')
    expect(saveButton()).toBeDisabled()
  })

  it('refuses to save when every page is removed', async () => {
    renderOrganiser(2)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 2' }))

    expect(screen.getByText('Every page is removed. Put at least one back.')).toBeVisible()
    expect(saveButton()).toBeDisabled()
  })

  it('undoes everything with start over', async () => {
    renderOrganiser(3)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Turn Page 2 right' }))
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }))

    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('3 pages, unchanged')).toBeVisible()
  })

  it('summarises what has been done', async () => {
    renderOrganiser(4)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Turn Page 2 right' }))

    expect(screen.getByText('1 page removed, 1 page turned')).toBeVisible()
  })

  it('shows the result once it is saved', async () => {
    renderOrganiser(3)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.click(saveButton())

    const result = await screen.findByRole('status', { name: 'Result' })
    expect(within(result).getByText('report-organised.pdf')).toBeInTheDocument()
  })

  it('shows why a save failed', async () => {
    const { ApiError } = await import('@/lib/api')
    organiseDocument.mockRejectedValue(
      new ApiError('PROCESSING_FAILED', 'There is no page 9.', 422),
    )
    renderOrganiser(2)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.click(saveButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('There is no page 9.')
  })

  it('will not save without a name', async () => {
    renderOrganiser(2)

    await userEvent.click(screen.getByRole('button', { name: 'Remove Page 1' }))
    await userEvent.clear(screen.getByLabelText('File name'))

    expect(saveButton()).toBeDisabled()
  })
})
