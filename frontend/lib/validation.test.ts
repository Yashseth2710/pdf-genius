import { describe, expect, it } from 'vitest'

import { loginSchema, registerSchema } from '@/lib/validation'

const valid = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@example.com',
  password: 'a-good-long-password',
}

describe('registerSchema', () => {
  it('accepts a complete, valid form', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a password under 8 characters, matching the backend rule', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'short' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('8 characters')
  })

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects a name that is only whitespace', () => {
    expect(registerSchema.safeParse({ ...valid, first_name: '   ' }).success).toBe(false)
  })

  it('trims surrounding whitespace from names', () => {
    const result = registerSchema.safeParse({ ...valid, first_name: '  Ada  ' })

    expect(result.success).toBe(true)
    expect(result.data?.first_name).toBe('Ada')
  })

  it('rejects a password over 128 characters', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'x'.repeat(129) }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('accepts any non-empty password', () => {
    // Someone whose password predates the 8-character rule must still be able
    // to sign in; the server decides, not this form.
    expect(loginSchema.safeParse({ email: 'ada@example.com', password: 'old' }).success).toBe(true)
  })

  it('requires a password to be entered', () => {
    expect(loginSchema.safeParse({ email: 'ada@example.com', password: '' }).success).toBe(false)
  })

  it('requires a valid email', () => {
    expect(loginSchema.safeParse({ email: '', password: 'whatever' }).success).toBe(false)
  })
})
