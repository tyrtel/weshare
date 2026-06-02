import { ok } from '../core/types/Result';
import type { Result } from '../core/types/Result';
import type { AppError } from '../core/types/AppError';
import type { IAuditLogRepository } from '../core/interfaces/IAuditLogRepository';
import type { AuditEvent } from '../core/models/AuditEvent';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private readonly events: AuditEvent[] = [];

  seed(events: AuditEvent[]): this {
    this.events.push(...events);
    return this;
  }

  getEventsForRequest = async (splitRequestId: string): Promise<Result<AuditEvent[], AppError>> => {
    const matching = this.events
      .filter(e => e.entityId === splitRequestId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return ok(matching);
  };

  appendEvent = async (event: AuditEvent): Promise<Result<AuditEvent, AppError>> => {
    this.events.push(event);
    return ok(event);
  };
}
