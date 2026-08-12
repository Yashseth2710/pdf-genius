import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ImageMultiSelect,
  PdfMultiSelect,
  PdfSingleSelect,
} from '@/components/tools/document-picker'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DocumentSummary } from '@/types/api'

vi.mock('@/lib/documents', () => ({ fetchDocumentBlob: vi.fn() }))
vi.mock('@/lib/pdf-render', () => ({ loadDocument: vi.fn(), renderPage: vi.fn() }))

function doc(id: string, name: string, mime = 'application/pdf'): DocumentSummary {
  return {
    id,
    original_filename: name,
    mime_type: mime,
    file_size: 2048,
    page_count: mime === 'application/pdf' ? 3 : null,
    status: 'READY',
    created_at: '2026-08-13T10:00:00Z',
  }
}

const state = {
  isPending: false,
  isError: false,
  error: null,
  onRetry: vi.fn(),
}

function wrap(ui: React.ReactNode) {
  render(<TooltipProvider delay={0}>{ui}</TooltipProvider>)
}

describe('the way to add a document that is not in the list', () => {
  it('is offered when choosing one PDF', () => {
    wrap(
      <PdfSingleSelect
        {...state}
        documents={[doc('a', 'report.pdf')]}
        hasOnlyNonPdfs={false}
        value={null}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: 'Add a PDF' })).toHaveAttribute('href', '/dashboard')
  })

  it('is offered when choosing several PDFs', () => {
    wrap(
      <PdfMultiSelect
        {...state}
        documents={[doc('a', 'report.pdf')]}
        hasOnlyNonPdfs={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: 'Add a PDF' })).toHaveAttribute('href', '/dashboard')
  })

  it('names images when the tool wants images', () => {
    wrap(
      <ImageMultiSelect
        {...state}
        documents={[doc('a', 'beach.jpg', 'image/jpeg')]}
        hasOnlyNonImages={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: 'Add an image' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a PDF' })).not.toBeInTheDocument()
  })

  it('is not one of the files, so the list stays a list of files', () => {
    // It sits under the list rather than in it: an "add" row among the files
    // would be one more thing that looks tickable.
    wrap(
      <PdfMultiSelect
        {...state}
        documents={[doc('a', 'first.pdf'), doc('b', 'second.pdf')]}
        hasOnlyNonPdfs={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Add a PDF' })).toBeInTheDocument()
  })

  it('sits outside the radio group, so it is not an option you can pick', () => {
    // A radio group takes arrow keys to move between its options. A link among
    // them would be a stop that cannot be chosen, which is worse than useless.
    wrap(
      <PdfSingleSelect
        {...state}
        documents={[doc('a', 'report.pdf')]}
        hasOnlyNonPdfs={false}
        value={null}
        onChange={vi.fn()}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Choose a PDF' })
    expect(within(group).queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a PDF' })).toBeInTheDocument()
  })

  it('is not shown twice when there is nothing to add it to', () => {
    // The empty state already offers an upload, and one screen saying the same
    // thing in two places reads as a mistake.
    wrap(
      <PdfMultiSelect
        {...state}
        documents={[]}
        hasOnlyNonPdfs={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: 'Upload a PDF' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add a PDF' })).not.toBeInTheDocument()
  })

  it('actually has a border, so it reads as a button', () => {
    // The button's base sets border-transparent and the outline variant sets
    // border-border. Only tailwind-merge picks a winner; passing the raw cva
    // string keeps both, the transparent one wins, and an outline button has
    // no visible edge on a white page. jsdom applies no CSS, so the class list
    // is what can be checked here - and it is where the bug lived.
    wrap(
      <PdfMultiSelect
        {...state}
        documents={[doc('a', 'report.pdf')]}
        hasOnlyNonPdfs={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: 'Add a PDF' })
    expect(link.className).toContain('border-border')
    expect(link.className).not.toContain('border-transparent')
  })

  it('is not shown while the list is still loading', () => {
    wrap(
      <PdfMultiSelect
        {...state}
        isPending
        documents={[]}
        hasOnlyNonPdfs={false}
        selected={[]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Add a PDF' })).not.toBeInTheDocument()
  })
})
