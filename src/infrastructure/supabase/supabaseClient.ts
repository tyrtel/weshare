import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { LargeSecureStore } from './LargeSecureStore';

// ── Hand-written Database type ────────────────────────────────────────────────
// Replace this with the output of `npx supabase gen types typescript --local`
// once a local Supabase project is initialised.

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
        };
      };
      trips: {
        Row: {
          id: string;
          name: string;
          currency: string;
          owner_id: string;
          created_at: string;
          invite_token: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          currency: string;
          owner_id: string;
          invite_token?: string | null;
        };
        Update: {
          name?: string;
          currency?: string;
          invite_token?: string | null;
        };
      };
      trip_members: {
        Row: {
          trip_id: string;
          user_id: string;
          display_name: string;
          is_guest: boolean;
          joined_at: string;
          phone: string | null;
          email: string | null;
        };
        Insert: {
          trip_id: string;
          user_id: string;
          display_name: string;
          is_guest?: boolean;
          phone?: string | null;
          email?: string | null;
        };
        Update: {
          display_name?: string;
          phone?: string | null;
          email?: string | null;
        };
      };
      expenses: {
        Row: {
          id: string;
          trip_id: string;
          description: string;
          total_amount_cents: number;
          currency: string;
          paid_by_user_id: string;
          created_at: string;
          metadata: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          trip_id: string;
          description: string;
          total_amount_cents: number;
          currency: string;
          paid_by_user_id: string;
          metadata?: Record<string, unknown>;
        };
        Update: {
          description?: string;
          total_amount_cents?: number;
          metadata?: Record<string, unknown>;
        };
      };
      splits: {
        Row: {
          id: string;
          expense_id: string;
          user_id: string;
          amount_owed_cents: number;
          amount_paid_cents: number;
          settled_at: string | null;
        };
        Insert: {
          id?: string;
          expense_id: string;
          user_id: string;
          amount_owed_cents: number;
          amount_paid_cents?: number;
          settled_at?: string | null;
        };
        Update: {
          amount_paid_cents?: number;
          settled_at?: string | null;
        };
      };
      split_requests: {
        Row: {
          id: string;
          trip_id: string;
          requester_user_id: string;
          payer_user_id: string;
          amount_cents: number;
          currency: string;
          note: string;
          status: string;
          preferred_wallet: string;
          external_ref_id: string | null;
          stripe_payment_link_id: string | null;
          stripe_session_id: string | null;
          ob_payment_id: string | null;
          ob_provider: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          requester_user_id: string;
          payer_user_id: string;
          amount_cents: number;
          currency: string;
          note?: string;
          status: string;
          preferred_wallet: string;
          external_ref_id?: string | null;
          stripe_payment_link_id?: string | null;
          stripe_session_id?: string | null;
          ob_payment_id?: string | null;
          ob_provider?: string | null;
        };
        Update: {
          status?: string;
          preferred_wallet?: string;
          external_ref_id?: string | null;
          stripe_payment_link_id?: string | null;
          stripe_session_id?: string | null;
          ob_payment_id?: string | null;
          ob_provider?: string | null;
          note?: string;
          updated_at?: string;
        };
      };
    };
  };
};

// ── Client ────────────────────────────────────────────────────────────────────

// Fall back to a syntactically valid placeholder so createClient() does not
// throw "supabaseUrl is required." when the env vars are absent (e.g. in
// simulation mode where this client is never actually used).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';

// EXPO_PUBLIC_SUPABASE_ANON_KEY is intentionally public. Supabase anon keys are
// designed to be embedded in client apps — they identify the project but grant no
// elevated privileges. All data access is controlled by Row Level Security (RLS)
// policies on the database. If you see this in a bundle or source map, that is
// expected and not a security issue. See: https://supabase.com/docs/guides/api/api-keys
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

// expo-secure-store is not available on web; fall back to the Supabase default
// (localStorage) on that platform so the web build keeps working.
const storage = Platform.OS === 'web' ? undefined : LargeSecureStore;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
