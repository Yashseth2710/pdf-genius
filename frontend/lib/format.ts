/** Human-readable file size. 184320 -> "180 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  // One decimal below 10 ("1.4 MB"), none above ("24 MB") - past ten the
  // decimal is noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * When something happened, in the reader's own timezone.
 *
 * Recent times are relative ("4 minutes ago") because that is how people think
 * about something they just did; anything older gets a real date, because
 * "43 days ago" is arithmetic nobody asked for.
 */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''

  const seconds = Math.round((now.getTime() - at.getTime()) / 1000)
  // A clock a second or two ahead of the server should read "just now", not
  // "in 2 seconds".
  if (seconds < 60) return 'just now'
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }
  if (seconds < 86_400) {
    const hours = Math.floor(seconds / 3600)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The full timestamp, for a tooltip on top of the friendly one. */
export function formatExactly(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toLocaleString()
}

/** "12 pages", "1 page", or nothing at all for a file with no page count. */
export function formatPages(pageCount: number | null): string | null {
  if (pageCount === null) return null
  return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
}
