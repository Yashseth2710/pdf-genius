import type { PlannedPage } from '@/types/api'

/**
 * The editing state of the page organiser, as plain data.
 *
 * Every rule about what an edit means lives here rather than in the component:
 * deleting is dropping an entry, reordering is moving one, and rotating adds a
 * quarter turn. Keeping it separate from the canvas means it can be tested
 * without rendering a PDF, which is the difference between fast tests and none.
 */
export interface PlanEntry {
  /** Stable across every edit, so React keys and drag ids never shift. */
  key: string
  /** The page in the original document, 1-based. */
  number: number
  /** Clockwise degrees to add to however the page already sits. */
  rotation: number
  /** Marked for removal, still shown so it can be put back. */
  removed: boolean
}

export function initialPlan(pageCount: number): PlanEntry[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    key: `page-${index + 1}`,
    number: index + 1,
    rotation: 0,
    removed: false,
  }))
}

function update(plan: PlanEntry[], key: string, change: (entry: PlanEntry) => PlanEntry) {
  return plan.map((entry) => (entry.key === key ? change(entry) : entry))
}

/** Turn one page a quarter turn. Negative degrees turn it the other way. */
export function rotate(plan: PlanEntry[], key: string, degrees: number): PlanEntry[] {
  return update(plan, key, (entry) => ({
    ...entry,
    // Kept in 0–359 so the UI never has to reason about -90 or 450.
    rotation: (((entry.rotation + degrees) % 360) + 360) % 360,
  }))
}

/** Turn every page that is still being kept. */
export function rotateAll(plan: PlanEntry[], degrees: number): PlanEntry[] {
  return plan.map((entry) =>
    entry.removed
      ? entry
      : { ...entry, rotation: (((entry.rotation + degrees) % 360) + 360) % 360 },
  )
}

/**
 * Mark a page for removal rather than dropping it.
 *
 * Keeping it in the list is what makes "put it back" possible without an undo
 * stack, and means the page numbers a user is looking at do not renumber under
 * them the moment they delete something.
 */
export function remove(plan: PlanEntry[], key: string): PlanEntry[] {
  return update(plan, key, (entry) => ({ ...entry, removed: true }))
}

export function restore(plan: PlanEntry[], key: string): PlanEntry[] {
  return update(plan, key, (entry) => ({ ...entry, removed: false }))
}

export function toggleRemoved(plan: PlanEntry[], key: string): PlanEntry[] {
  return update(plan, key, (entry) => ({ ...entry, removed: !entry.removed }))
}

/** Move a page to a new position. Out-of-range targets leave the plan alone. */
export function move(plan: PlanEntry[], from: number, to: number): PlanEntry[] {
  if (from < 0 || from >= plan.length || to < 0 || to >= plan.length || from === to) {
    return plan
  }
  const next = [...plan]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function moveByKey(plan: PlanEntry[], key: string, to: number): PlanEntry[] {
  return move(
    plan,
    plan.findIndex((entry) => entry.key === key),
    to,
  )
}

/** The pages that will end up in the new document. */
export function keptPages(plan: PlanEntry[]): PlanEntry[] {
  return plan.filter((entry) => !entry.removed)
}

/** What gets sent to the API: kept pages only, in order, rotations included. */
export function toRequest(plan: PlanEntry[]): PlannedPage[] {
  return keptPages(plan).map((entry) => ({
    number: entry.number,
    rotation: entry.rotation as PlannedPage['rotation'],
  }))
}

/**
 * Whether anything has actually changed.
 *
 * Used to keep the save button disabled until there is something to save:
 * running a job that rebuilds a document identically wastes the user's time
 * and leaves a pointless entry in their history.
 */
export function isChanged(plan: PlanEntry[]): boolean {
  return plan.some(
    (entry, index) => entry.removed || entry.rotation !== 0 || entry.number !== index + 1,
  )
}

/** A short description of the edit, for the confirm button and the summary. */
export function describe(plan: PlanEntry[], pageCount: number): string {
  const kept = keptPages(plan)
  const removedCount = plan.length - kept.length
  const rotatedCount = kept.filter((entry) => entry.rotation !== 0).length
  // Reordered means the pages no longer climb. Removing pages 2 and 3 leaves
  // 1, 4, 5 — still ascending, and not something to call "reordered".
  const reordered = !isAscending(kept)

  const parts: string[] = []
  if (removedCount > 0) {
    parts.push(`${removedCount} ${removedCount === 1 ? 'page' : 'pages'} removed`)
  }
  if (rotatedCount > 0) {
    parts.push(`${rotatedCount} ${rotatedCount === 1 ? 'page' : 'pages'} turned`)
  }
  if (reordered) parts.push('reordered')

  if (parts.length === 0) return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}, unchanged`
  return parts.join(', ')
}

function isAscending(entries: PlanEntry[]): boolean {
  return entries.every((entry, index) => index === 0 || entry.number > entries[index - 1].number)
}
