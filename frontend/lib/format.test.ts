import { describe, expect, it } from 'vitest'

import { formatBytes, formatPages } from '@/lib/format'

describe('formatBytes', () => {
  it('leaves small files in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('steps up through the units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(184_320)).toBe('180 KB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
    expect(formatBytes(26_214_400)).toBe('25 MB')
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
  })
})

describe('formatPages', () => {
  it('says nothing when there is no page count', () => {
    expect(formatPages(null)).toBeNull()
  })

  it('gets the singular right', () => {
    expect(formatPages(1)).toBe('1 page')
    expect(formatPages(12)).toBe('12 pages')
  })
})
