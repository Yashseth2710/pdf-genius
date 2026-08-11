/**
 * Mirrors the backend response envelope (spec section 47).
 * Every endpoint returns one of these two shapes.
 */

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiErrorDetail {
  code: string
  message: string
}

export interface ApiFailure {
  success: false
  error: ApiErrorDetail
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

/** GET /health */
export interface HealthStatus {
  status: string
  version: string
  environment: string
  /** False when AI_PROVIDER is unset, so the UI can hide AI features. */
  ai_enabled: boolean
}

/** A user account, as the API describes it. Never includes the password hash. */
export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  created_at: string
}

/** Returned by POST /auth/register and POST /auth/login. */
export interface AuthPayload {
  access_token: string
  token_type: string
  /** Lifetime in seconds. */
  expires_in: number
  user: User
}

export type DocumentStatus = 'UPLOADED' | 'READY' | 'FAILED'

/** A stored document. Note there is no storage path - that stays internal. */
export interface DocumentSummary {
  id: string
  original_filename: string
  mime_type: string
  file_size: number
  page_count: number | null
  status: DocumentStatus
  created_at: string
}

export interface DocumentListPage {
  items: DocumentSummary[]
  total: number
  limit: number
  offset: number
}

export interface RegisterInput {
  email: string
  password: string
  first_name: string
  last_name: string
}

export interface LoginInput {
  email: string
  password: string
}
