import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getSupabaseConfig(): { url: string; anonKey: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url?.startsWith('http') || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

export function createServiceClient(): SupabaseClient {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Missing Supabase service configuration');
  return createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false } });
}

export function createAnonAuthClient(): SupabaseClient {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error('Missing Supabase auth configuration');
  return createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
}
