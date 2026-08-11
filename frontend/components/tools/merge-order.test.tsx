import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MergeOrder } from '@/components/tools/merge-order'
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

function renderOrder(overrides: Partial<Parameters<typeof MergeOrder>[0]> = {}) {
  const onReorder = vi.fn()
  const onRemove = vi.fn()
  render(
    <TooltipProvider delay={0}>
      <MergeOrder documents={documents} onReorder={onReorder} onRemove={onRemove} {...overrides} />
    </TooltipProvider>,
  )
  return { onReorder, onRemove }
}

describe('MergeOrder', () => {
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

    await userEvent.click(screen.getByRole('button', { name: 'Remove body.pdf from the merge' }))

    expect(onRemove).toHaveBeenCalledWith('b')
  })

  it('offers a keyboard route to reordering, not only dragging', () => {
    // The drag handle is the mouse path; these buttons are the reason someone
    // on a keyboard can still use this tool.
    renderOrder()

    expect(screen.getAllByRole('button', { name: /Move .* up/ })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: /Drag .* to reorder/ })).toHaveLength(3)
  })
})
