import { apiFetch } from '@/lib/api'
import { tokenStore } from '@/lib/auth'
import type { JobFilters, JobListPage } from '@/types/api'

function authHeader(): Record<string, string> {
  const token = tokenStore.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Your processing history, newest first.
 *
 * Empty filters are left out of the query rather than sent as blanks: an
 * `operation=` with nothing after it is a filter the server has to decide how
 * to read, and the answer should not depend on that.
 */
export async function listJobs(
  filters: JobFilters = {},
  limit = 20,
  offset = 0,
): Promise<JobListPage> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value)
  }

  return apiFetch<JobListPage>(`/jobs?${query.toString()}`, { headers: authHeader() })
}

/**
 * Forget that a job happened.
 *
 * Only the record goes. Whatever it produced stays in the documents list —
 * someone tidying their history has not asked to lose the files they made.
 */
export async function deleteJob(id: string): Promise<void> {
  await apiFetch(`/jobs/${id}`, { method: 'DELETE', headers: authHeader() })
}
