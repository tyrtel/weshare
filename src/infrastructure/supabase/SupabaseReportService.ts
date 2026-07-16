import { supabase } from './supabaseClient';
import type { IReportService, ReportRateLimitStatus } from '../../core/interfaces/IReportService';

export class SupabaseReportService implements IReportService {
  async checkRateLimit(): Promise<ReportRateLimitStatus> {
    const { data, error } = await supabase.rpc('check_report_rate_limit');
    if (error) throw new Error(error.message);

    const row = (data as { allowed: boolean; remaining: number }[] | null)?.[0];
    return { allowed: row?.allowed ?? false, remaining: row?.remaining ?? 0 };
  }
}
