import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function getSupabase() {
  if (client) return client;
  if (!url || !key || url.includes('lgsdoutarthfymbjgdrj.supabase.co')) {
    throw new Error('Configura el proyecto Supabase independiente de CadenaPDF.');
  }
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
