import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function owner(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new Error('No autorizado.');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error('No autorizado.');
  return user;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { id, action } = await request.json();
    if (typeof id !== 'string' || !['pause', 'resume', 'release_turn', 'skip_next'].includes(action)) throw new Error('Acción no válida.');
    const user = await owner(request);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.rpc('owner_manage_open_round', { p_workflow_id: id, p_owner_id: user.id, p_action: action });
    if (error) throw error;
    // Email delivery will be delegated to the durable outbox. Do not expose a
    // capability token to the owner/browser in the meantime.
    return Response.json({ ok: Boolean(data?.ok), skipped: data?.skipped ?? null }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 400, headers: cors });
  }
});
