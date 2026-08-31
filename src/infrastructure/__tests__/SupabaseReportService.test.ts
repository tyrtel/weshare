jest.mock('../supabase/supabaseClient', () => ({
  supabase: { rpc: jest.fn() },
}));

import { SupabaseReportService } from '../supabase/SupabaseReportService';

const { supabase } = require('../supabase/supabaseClient') as { supabase: { rpc: jest.Mock } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SupabaseReportService — checkRateLimit', () => {
  it('maps the first row of the RPC result', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 3 }], error: null });

    const status = await new SupabaseReportService().checkRateLimit();

    expect(status).toEqual({ allowed: true, remaining: 3 });
    expect(supabase.rpc).toHaveBeenCalledWith('check_report_rate_limit');
  });

  it('defaults to not-allowed with zero remaining when the RPC returns no rows', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null });

    const status = await new SupabaseReportService().checkRateLimit();

    expect(status).toEqual({ allowed: false, remaining: 0 });
  });

  it('defaults the same way when the RPC returns null data', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    const status = await new SupabaseReportService().checkRateLimit();

    expect(status).toEqual({ allowed: false, remaining: 0 });
  });

  it('throws when the RPC reports an error', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    await expect(new SupabaseReportService().checkRateLimit()).rejects.toThrow('function does not exist');
  });
});
