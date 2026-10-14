import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const hash = async (v:string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req => { if(req.method==='OPTIONS') return new Response('ok',{headers:cors}); try {
  const {id,groupKey='',name,email='',sessionId}=await req.json(); if(!id||!name?.trim()||!sessionId) throw new Error('Datos inválidos.');
  if(email && (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email))) throw new Error('El correo no es válido.');
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const {data:round}=await admin.from('workflows').select('group_key_hash').eq('id',id).maybeSingle(); if(!round || (round.group_key_hash && round.group_key_hash!==await hash(groupKey))) throw new Error('No se pudo acceder a esta ronda.');
  const sessionHash=await hash(sessionId); const {data:turn,error}=await admin.rpc('claim_open_turn',{p_workflow_id:id,p_holder_name:name.trim(),p_session_hash:sessionHash,p_email:email.trim().toLowerCase()||null}); if(error) throw error;
  if(turn.state==='active'){ const {data:v,error:e}=await admin.from('document_versions').select('storage_path').eq('workflow_id',id).order('sequence',{ascending:false}).limit(1).single(); if(e) throw e; const {data:l,error:le}=await admin.storage.from('firmador-documents').createSignedUrl(v.storage_path,600); if(le) throw le; turn.pdfUrl=l.signedUrl; }
  return Response.json(turn,{headers:cors});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Error'},{status:400,headers:cors});} });
