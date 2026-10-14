import { createClient } from 'jsr:@supabase/supabase-js@2';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const hash=async(v:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{const{id,sessionId}=await req.json();if(!id||!sessionId)throw new Error('Datos inválidos.');const a=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);const{data,error}=await a.rpc('release_open_turn',{p_workflow_id:id,p_session_hash:await hash(sessionId)});if(error)throw error;
  const next=data?.next;
  const resendKey=Deno.env.get('RESEND_API_KEY');
  if(next?.email && resendKey){
    const link=`https://firmador.pabloun.workers.dev/r/${id}?turn=${encodeURIComponent(next.token)}`;
    const from=Deno.env.get('RESEND_FROM_EMAIL');
    if (!from) throw new Error('El remitente de correo no está configurado.');
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[next.email],subject:'Ya puedes firmar tu documento',html:`<p>Hola ${next.holder_name},</p><p>Tu turno para firmar ya está disponible durante 10 minutos.</p><p><a href="${link}">Abrir documento</a></p>`})});
    if(!response.ok) console.error('No se pudo enviar el aviso de turno', response.status);
  }
  return Response.json({ok:true},{headers:cors});}catch(e){return Response.json({error:e instanceof Error?e.message:'Error'},{status:400,headers:cors});}});
