import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const hash = async (bytes: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
const hashText = async (value: string) => hash(new TextEncoder().encode(value));

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const form = await request.formData();
    const id = String(form.get('id') || '');
    const groupKey = String(form.get('groupKey') || '');
    const sessionId = String(form.get('sessionId') || '');
    const reviewedPrevious = form.get('reviewedPrevious') === 'true';
    const document = form.get('document');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !sessionId || !reviewedPrevious || !(document instanceof File)) throw new Error('Completa la confirmación y adjunta el PDF firmado.');
    if (document.type !== 'application/pdf' && !document.name.toLowerCase().endsWith('.pdf')) throw new Error('El archivo debe ser un PDF.');
    if (!document.size || document.size > 10 * 1024 * 1024) throw new Error('El PDF debe pesar como máximo 10 MB.');
    const bytes = await document.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('El archivo no parece ser un PDF válido.');

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const sessionHash = await hashText(sessionId);
    const { data: workflow } = await admin.from('workflows').select('id,status,group_key_hash,current_version_id').eq('id', id).maybeSingle();
    if (!workflow || workflow.status !== 'active' || !workflow.current_version_id) throw new Error('Esta ronda no está disponible.');
    if (workflow.group_key_hash && workflow.group_key_hash !== await hashText(groupKey)) throw new Error('No se pudo acceder a esta ronda.');
    const { data: lock } = await admin.from('open_round_locks').select('version_id_at_claim,expires_at').eq('workflow_id', id).eq('holder_session_hash', sessionHash).maybeSingle();
    if (!lock || new Date(lock.expires_at).getTime() <= Date.now()) throw new Error('Tu turno ya no está activo.');
    if (lock.version_id_at_claim !== workflow.current_version_id) throw new Error('Hay una versión más reciente del documento. Vuelve a abrir tu turno.');
    const { data: existing } = await admin.from('signature_submissions').select('id').eq('workflow_id', id).eq('submitted_by_session_hash', sessionHash).eq('parent_version_id', workflow.current_version_id).in('status', ['uploaded', 'validating']).maybeSingle();
    if (existing) return Response.json({ state: 'review_pending' }, { headers: cors });

    const submissionId = crypto.randomUUID();
    const path = `${id}/submissions/${submissionId}.pdf`;
    const { error: uploadError } = await admin.storage.from('firmador-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw new Error('No pudimos guardar el PDF firmado.');
    const { error: insertError } = await admin.from('signature_submissions').insert({ id: submissionId, workflow_id: id, parent_version_id: workflow.current_version_id, storage_path: path, sha256: await hash(bytes), byte_size: document.size, submitted_by_session_hash: sessionHash, status: 'uploaded' });
    if (insertError) { await admin.storage.from('firmador-documents').remove([path]); throw new Error('No pudimos registrar la entrega.'); }
    await admin.from('open_round_locks').update({ reviewed_version_at: new Date().toISOString() }).eq('workflow_id', id).eq('holder_session_hash', sessionHash);
    await admin.from('workflow_audit_log').insert({ workflow_id: id, actor_type: 'participant', actor_session_hash: sessionHash, action: 'signed_version_submitted', metadata: { submission_id: submissionId, parent_version_id: workflow.current_version_id } });
    return Response.json({ state: 'review_pending' }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 400, headers: cors });
  }
});
