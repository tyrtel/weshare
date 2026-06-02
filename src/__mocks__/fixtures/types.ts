import type { Trip } from '../../core/models/Trip';
import type { TripMember } from '../../core/models/TripMember';
import type { Expense } from '../../core/models/Expense';
import type { Split } from '../../core/models/Split';
import type { SplitRequest } from '../../core/models/SplitRequest';
import type { AuditEvent } from '../../core/models/AuditEvent';

export interface StorageFixtures {
  trips?: Trip[];
  members?: TripMember[];
  expenses?: Expense[];
  splits?: Split[];
  splitRequests?: SplitRequest[];
  auditEvents?: AuditEvent[];
}
