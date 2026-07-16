import type { IReportService, ReportRateLimitStatus } from '../core/interfaces/IReportService';

export class MockReportService implements IReportService {
  callCount = 0;
  remainingOverride: number | null = null;
  maxCalls = 5;

  async checkRateLimit(): Promise<ReportRateLimitStatus> {
    if (this.callCount >= this.maxCalls) return { allowed: false, remaining: 0 };
    this.callCount += 1;
    const remaining = this.remainingOverride ?? this.maxCalls - this.callCount;
    return { allowed: true, remaining };
  }
}
