import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const hash = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { id, groupKey = '', sessionId, comment } = await request.json();
    if (typeof id !== 'string' || typeof sessionId !== 'string' || typeof comment !== 'string' || !comment.trim() || comment.trim().length > 1000) throw new Error('Describe el problema para detener la ronda.');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: workflow } = await admin.from('workflows').select('group_key_hash,status').eq('id', id).maybeSingle();
    if (!workflow || workflow.status !== 'active' || (workflow.group_key_hash && workflow.group_key_hash !== await hash(groupKey))) throw new Error('No se pudo acceder a esta ronda.');
    const sessionHash = await hash(sessionId);
    const { data: lock } = await admin.from('open_round_locks').select('holder_session_hash').eq('workflow_id', id).maybeSingle();
    if (!lock || lock.holder_session_hash !== sessionHash) throw new Error('Solo la persona con el turno activo puede informar un problema.');
    const reason = comment.trim();
    const { error: updateError } = await admin.from('workflows').update({ status: 'paused_error', paused_at: new Date().toISOString(), paused_reason: reason }).eq('id', id).eq('status', 'active');
    if (updateError) throw updateError;
    await admin.from('error_reports').insert({ workflow_id: id, reporter_session_hash: sessionHash, comment: reason });
    await admin.from('open_round_locks').delete().eq('workflow_id', id).eq('holder_session_hash', sessionHash);
    await admin.from('workflow_audit_log').insert({ workflow_id: id, actor_type: 'participant', actor_session_hash: sessionHash, action: 'round_paused_by_report', metadata: { reason_length: reason.length } });
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 400, headers: cors });
  }
});
