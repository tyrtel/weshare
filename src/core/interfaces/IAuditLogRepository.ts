import type { Result } from '../types/Result';
import type { AppError } from '../types/AppError';
import type { AuditEvent } from '../models/AuditEvent';

export interface IAuditLogRepository {
  getEventsForRequest(splitRequestId: string): Promise<Result<AuditEvent[], AppError>>;
  appendEvent(event: AuditEvent): Promise<Result<AuditEvent, AppError>>;
}
