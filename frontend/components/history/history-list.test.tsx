import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HistoryList } from '@/components/history/history-list'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Job, JobListPage, OperationType } from '@/types/api'

const listJobs = vi.fn()
const deleteJob = vi.fn()

vi.mock('@/lib/jobs', () => ({
  listJobs: (...args: unknown[]) => listJobs(...args),
  deleteJob: (...args: unknown[]) => deleteJob(...args),
}))

function job(id: string, operation: OperationType, over: Partial<Job> = {}): Job {
  return {
    id,
    operation,
    status: 'COMPLETED',
    document_id: 'doc-1',
    output_document_ids: ['out-1'],
    options: { mode: 'ranges', ranges: '1-2' },
    result: {},
    error_message: null,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    ...over,
  }
}

function page(items: Job[], total = items.length): JobListPage {
  return { items, total, limit: 20, offset: 0 }
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider delay={0}>
        <HistoryList />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

/** The filters the component sent on its most recent call. */
function lastFilters(): Record<string, unknown> {
  return listJobs.mock.calls.at(-1)?.[0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  listJobs.mockResolvedValue(page([job('a', 'SPLIT'), job('b', 'MERGE')]))
  deleteJob.mockResolvedValue(undefined)
})

describe('HistoryList', () => {
  it('says what each run did, not just which tool it was', async () => {
    renderList()

    expect(await screen.findByText(/Split pages 1-2/)).toBeInTheDocument()
  })

  it('shows failed runs with the reason they failed', async () => {
    // A history that only lists successes is the one you cannot use when
    // something has gone wrong.
    listJobs.mockResolvedValue(
      page([
        job('a', 'SPLIT', {
          status: 'FAILED',
          error_message: "'8-12' goes past the end of the document.",
          output_document_ids: [],
        }),
      ]),
    )
    renderList()

    expect(await screen.findByText(/goes past the end of the document/)).toBeInTheDocument()
  })

  it('narrows by tool', async () => {
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.selectOptions(screen.getByLabelText('Tool'), 'MERGE')

    await waitFor(() => expect(lastFilters()).toMatchObject({ operation: 'MERGE' }))
  })

  it('narrows by result', async () => {
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.selectOptions(screen.getByLabelText('Result'), 'FAILED')

    await waitFor(() => expect(lastFilters()).toMatchObject({ status: 'FAILED' }))
  })

  it('narrows by date', async () => {
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.type(screen.getByLabelText('From'), '2026-08-01')

    await waitFor(() => expect(lastFilters()).toMatchObject({ date_from: '2026-08-01' }))
  })

  it('goes back to the first page when a filter changes', async () => {
    // Page 3 of the old result says nothing about the new one, and landing on
    // an empty page looks like "no results".
    listJobs.mockResolvedValue(page([job('a', 'SPLIT')], 60))
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listJobs.mock.calls.at(-1)?.[2]).toBe(20))

    await userEvent.selectOptions(screen.getByLabelText('Tool'), 'MERGE')

    await waitFor(() => expect(listJobs.mock.calls.at(-1)?.[2]).toBe(0))
  })

  it('removes an entry on request', async () => {
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.click(screen.getAllByRole('button', { name: /^Remove this/ })[0])

    // The second argument is TanStack Query's own context, which it hands to
    // every mutationFn.
    await waitFor(() => expect(deleteJob).toHaveBeenCalledWith('a', expect.anything()))
  })

  it('promises the files survive when removing an entry', async () => {
    // "Delete" next to a list of files you made is a frightening button; the
    // tooltip is where that fear gets answered.
    renderList()
    await screen.findByText(/Split pages 1-2/)

    await userEvent.hover(screen.getAllByRole('button', { name: /^Remove this/ })[0])

    expect(await screen.findByText(/your files are kept/i)).toBeInTheDocument()
  })

  it('tells a new account what will appear here', async () => {
    listJobs.mockResolvedValue(page([]))
    renderList()

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try a tool' })).toBeInTheDocument()
  })

  it('does not tell someone to try a tool when their filter simply matched nothing', async () => {
    // They have used five tools. Being told to try one reads as an app that is
    // not paying attention.
    listJobs.mockResolvedValue(page([]))
    renderList()
    await screen.findByText('Nothing here yet')

    await userEvent.selectOptions(screen.getByLabelText('Tool'), 'MERGE')

    expect(await screen.findByText('Nothing matches those filters')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Try a tool' })).not.toBeInTheDocument()
  })

  it('offers a way out of a filter that found nothing', async () => {
    listJobs.mockResolvedValue(page([]))
    renderList()
    await screen.findByText('Nothing here yet')
    await userEvent.selectOptions(screen.getByLabelText('Tool'), 'MERGE')
    await screen.findByText('Nothing matches those filters')

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    await waitFor(() => expect(lastFilters()).toEqual({}))
  })

  it('hides pagination when everything fits on one page', async () => {
    renderList()
    await screen.findByText(/Split pages 1-2/)

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
  })
})
