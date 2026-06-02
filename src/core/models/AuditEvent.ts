export interface AuditEvent {
  id:         string;
  entityType: string;              // always 'split_request' for now
  entityId:   string;              // split_request.id
  eventType:  string;              // e.g. 'stripe.checkout.completed'
  payload:    Record<string, unknown> | null;  // redacted webhook data
  createdAt:  Date;
}
