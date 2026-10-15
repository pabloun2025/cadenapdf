import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const encoder = new TextEncoder();
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { id, groupKey = '', inviteToken = '' } = await request.json();
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof groupKey !== 'string' || typeof inviteToken !== 'string') throw new Error('Enlace inválido.');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: round } = await admin.from('workflows').select('id,title,message,status,group_key_hash').eq('id', id).maybeSingle();
    if (!round || round.status !== 'active') throw new Error('Esta ronda no está disponible.');
    let privateInvite = false;
    if (inviteToken) {
      const { data: invitation } = await admin.from('round_invitations').select('id').eq('workflow_id', id).eq('token_hash', await hash(inviteToken)).in('status', ['pending','opened']).gt('expires_at', new Date().toISOString()).maybeSingle();
      privateInvite = Boolean(invitation);
      if (!privateInvite) throw new Error('La invitación no es válida o ha caducado.');
    }
    if (!privateInvite && round.group_key_hash && round.group_key_hash !== await hash(groupKey)) throw new Error('La clave no es correcta.');
    return Response.json({ title: round.title, message: round.message, needsKey: Boolean(round.group_key_hash) }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 400, headers: cors });
  }
});
