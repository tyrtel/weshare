export interface ReportRateLimitStatus {
  allowed: boolean;
  remaining: number;
}

export interface IReportService {
  checkRateLimit(): Promise<ReportRateLimitStatus>;
}
