import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
}

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    return createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'vs_supabase_auth',
    },
    global: {
      headers: { Accept: 'application/json' },
    },
    db: { schema: 'public' },
  });
}

/** Browser Supabase client — auth + RLS-scoped reads/writes when configured. */
export const supabase = createSupabaseClient();

export function getSupabaseClient(): SupabaseClient {
  return supabase;
}
