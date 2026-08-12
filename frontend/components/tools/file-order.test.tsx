import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FileOrder } from '@/components/tools/file-order'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentSummary } from '@/types/api'

function doc(id: string, name: string): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: 'application/pdf',
    file_size: 1024,
    page_count: 2,
    status: 'READY',
    created_at: '2026-08-11T10:00:00Z',
  }
}

const documents = [doc('a', 'cover.pdf'), doc('b', 'body.pdf'), doc('c', 'appendix.pdf')]

function renderOrder(overrides: Partial<Parameters<typeof FileOrder>[0]> = {}) {
  const onReorder = vi.fn()
  const onRemove = vi.fn()
  render(
    <TooltipProvider delay={0}>
      <FileOrder
        documents={documents}
        label="Merge order"
        emptyMessage="Nothing chosen yet. Tick at least two PDFs above."
        onReorder={onReorder}
        onRemove={onRemove}
        {...overrides}
      />
    </TooltipProvider>,
  )
  return { onReorder, onRemove }
}

describe('FileOrder', () => {
  it('numbers the files so the resulting order is visible', () => {
    renderOrder()

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1')
    expect(items[0]).toHaveTextContent('cover.pdf')
    expect(items[2]).toHaveTextContent('appendix.pdf')
  })

  it('says what to do when nothing is chosen yet', () => {
    renderOrder({ documents: [] })

    expect(screen.getByText(/tick at least two pdfs/i)).toBeInTheDocument()
  })

  it('moves a file down the list', async () => {
    const { onReorder } = renderOrder()

    await userEvent.click(screen.getByRole('button', { name: 'Move cover.pdf down' }))

    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })

  it('moves a file up the list', async () => {
    const { onReorder } = renderOrder()

    await userEvent.click(screen.getByRole('button', { name: 'Move appendix.pdf up' }))

    expect(onReorder).toHaveBeenCalledWith(2, 1)
  })

  it('cannot move the first file up or the last one down', () => {
    renderOrder()

    expect(screen.getByRole('button', { name: 'Move cover.pdf up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move appendix.pdf down' })).toBeDisabled()
  })

  it('removes the file the button belongs to', async () => {
    const { onRemove } = renderOrder()

    await userEvent.click(screen.getByRole('button', { name: 'Remove body.pdf' }))

    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('is named by whatever is using it, so two lists are not both "list"', () => {
    // Merge and images-to-PDF both render this. An unnamed list would leave a
    // screen reader - and a test - unable to say which one it had found.
    renderOrder({ label: 'Page order' })

    expect(screen.getByRole('list', { name: 'Page order' })).toBeInTheDocument()
  })

  it('takes its empty message from the tool, which knows how many are needed', () => {
    renderOrder({ documents: [], emptyMessage: 'Nothing chosen yet. Tick at least one image.' })

    expect(screen.getByText(/tick at least one image/i)).toBeInTheDocument()
  })

  it('offers a keyboard route to reordering, not only dragging', () => {
    // The drag handle is the mouse path; these buttons are the reason someone
    // on a keyboard can still use this tool.
    renderOrder()

    expect(screen.getAllByRole('button', { name: /Move .* up/ })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Drag .* to reorder/ })).toHaveLength(3)
  })
})
