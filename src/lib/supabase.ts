import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;
const url = 'https://lgsdoutarthfymbjgdrj.supabase.co';
// Supabase publishable keys are intentionally safe to ship in a browser.
const key = 'sb_publishable_1X5M_k_rSx8DNxQfdq3SiQ_n7WBhGFO';

export async function getSupabase() {
  if (client) return client;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
