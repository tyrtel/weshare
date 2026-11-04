import type { AppError } from '../../core/types/AppError';

export function toAppError(
  error: { message: string; code?: string },
  resource: string,
  id = '',
): AppError {
  // PGRST116: "JSON object requested, multiple (or no) rows returned"
  // P0002: no_data_found, raised by our own functions (e.g. join_trip_by_invite)
  if (error.code === 'PGRST116' || error.code === '406' || error.code === 'P0002') {
    return { kind: 'NotFoundError', resource, id };
  }
  // WS410: raised by join_*_by_invite (052) for an expired link
  if (error.code === 'WS410') {
    return { kind: 'ValidationError', field: 'inviteToken', message: error.message };
  }
  return { kind: 'NetworkError', message: error.message };
}
