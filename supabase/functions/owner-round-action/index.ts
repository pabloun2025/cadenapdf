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
    const { id, action, versionId, confirmPurge, confirmIrreversible } = await request.json();
    if (typeof id !== 'string' || !['pause', 'resume', 'release_turn', 'skip_next', 'rollback', 'finalize', 'purge'].includes(action)) throw new Error('Acción no válida.');
    const user = await owner(request);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (action === 'rollback' || action === 'finalize') {
      if (typeof versionId !== 'string' || confirmIrreversible !== true) throw new Error('Confirma la acción irreversible para continuar.');
      const { data, error } = await admin.rpc('owner_discard_versions', { p_workflow_id: id, p_owner_id: user.id, p_version_id: versionId, p_action: action });
      if (error || !data?.ok) throw new Error(action === 'rollback' ? 'No pudimos volver a la versión seleccionada.' : 'No pudimos aceptar la versión final.');
      return Response.json({ ok: true }, { headers: cors });
    }
    if (action === 'purge') {
      if (confirmPurge !== true) throw new Error('Confirma la purga para continuar.');
      const { data: workflow } = await admin.from('workflows').select('id').eq('id', id).eq('owner_id', user.id).maybeSingle();
      if (!workflow) throw new Error('No tienes acceso a esta ronda.');
      const root = await admin.storage.from('firmador-documents').list(id, { limit: 1000 });
      const paths = (root.data ?? []).filter(item => item.name !== 'submissions').map(item => `${id}/${item.name}`);
      const submissions = await admin.storage.from('firmador-documents').list(`${id}/submissions`, { limit: 1000 });
      paths.push(...(submissions.data ?? []).map(item => `${id}/submissions/${item.name}`));
      if (paths.length) { const { error } = await admin.storage.from('firmador-documents').remove(paths); if (error) throw new Error('No pudimos borrar los archivos privados.'); }
      const { error } = await admin.from('workflows').delete().eq('id', id).eq('owner_id', user.id);
      if (error) throw new Error('No pudimos purgar el proceso.');
      return Response.json({ ok: true, purged: true }, { headers: cors });
    }
    const { data, error } = await admin.rpc('owner_manage_open_round', { p_workflow_id: id, p_owner_id: user.id, p_action: action });
    if (error) throw error;
    if (action === 'release_turn' && data?.next?.email && data.next.token) {
      const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('RESEND_FROM_EMAIL');
      if (key && from) { const link = `https://firma.veryfacil.org/r/${id}?turn=${encodeURIComponent(data.next.token)}`; await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [data.next.email], subject: 'LeapSign: ya puedes firmar', html: `<main style="font-family:Arial,sans-serif;color:#183e35"><h1>LeapSign</h1><p>Hola ${String(data.next.holder_name).replace(/[&<>'"]/g, '')},</p><p>Tu turno está disponible durante 10 minutos.</p><p><a href="${link}" style="display:inline-block;background:#1d5749;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Abrir mi turno</a></p><p>Descarga el PDF, fírmalo con FirmaEC o Adobe y sube la copia firmada.</p></main>` }) }); }
    }
    return Response.json({ ok: Boolean(data?.ok), skipped: data?.skipped ?? null }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, { status: 400, headers: cors });
  }
});
