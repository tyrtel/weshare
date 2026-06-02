import type { AppError } from '../../core/types/AppError';

export function toAppError(
  error: { message: string; code?: string },
  resource: string,
  id = '',
): AppError {
  // PGRST116: "JSON object requested, multiple (or no) rows returned"
  if (error.code === 'PGRST116' || error.code === '406') {
    return { kind: 'NotFoundError', resource, id };
  }
  return { kind: 'NetworkError', message: error.message };
}
