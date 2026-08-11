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

/** "12 pages", "1 page", or nothing at all for a file with no page count. */
export function formatPages(pageCount: number | null): string | null {
  if (pageCount === null) return null
  return `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
}
