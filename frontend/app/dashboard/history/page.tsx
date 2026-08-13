import type { Metadata } from 'next'

import { HistoryList } from '@/components/history/history-list'
import { BackLink } from '@/components/shared/back-link'

export const metadata: Metadata = {
  title: 'History',
}

export default function HistoryPage() {
  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard">Your documents</BackLink>
        <h1 className="text-3xl">History</h1>
        <p className="text-muted-foreground mt-1">
          Everything you have run, newest first — including the runs that failed.
        </p>
      </div>

      <HistoryList />
    </div>
  )
}
