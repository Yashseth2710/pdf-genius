import { z } from 'zod'

/**
 * These mirror the backend's Pydantic rules exactly. Validating in the browser
 * is for fast feedback only - the server validates again, and it is the server
 * that decides.
 */

const email = z
  .string()
  .min(1, 'Enter your email address')
  .email('That does not look like an email address')

// Eight characters is the floor, matching the backend. No upper-case/symbol
// rule: length beats composition, and fussy rules just produce Password1!
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'That is longer than 128 characters')

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}`)
    .max(100, `Your ${label} is longer than 100 characters`)

export const registerSchema = z.object({
  first_name: name('first name'),
  last_name: name('last name'),
  email,
  password,
})

export const loginSchema = z.object({
  email,
  // Deliberately only "required": telling someone their *stored* password is
  // too short at sign-in would be an odd thing to reveal.
  password: z.string().min(1, 'Enter your password'),
})

export type RegisterValues = z.infer<typeof registerSchema>
export type LoginValues = z.infer<typeof loginSchema>
