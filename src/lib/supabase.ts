// Build-time / ETL Supabase client.
// Uses service_role — read/write at build & ETL only. Static output means this
// never ships to the client. dotenv loads .env into process.env for both the
// Astro build process and tsx-run ETL scripts.
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isDbConfigured = Boolean(url && serviceKey);

export const supabase: SupabaseClient | null = isDbConfigured
  ? createClient(url as string, serviceKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
