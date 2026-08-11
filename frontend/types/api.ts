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
