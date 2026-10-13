import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;

export async function getSupabase() {
  if (client) return client;
  const response = await fetch('/runtime-config.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Falta la configuración pública de Supabase.');
  const { url, key } = await response.json() as { url?: string; key?: string };
  if (!url || !key) throw new Error('Falta la configuración pública de Supabase.');
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
