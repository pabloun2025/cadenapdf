import { createClient } from "jsr:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const hash = async (v: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ]!,
  );
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { id, sessionId } = await req.json();
    if (!id || !sessionId) throw new Error("Datos inválidos.");
    const a = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await a.rpc("release_open_turn", {
      p_workflow_id: id,
      p_session_hash: await hash(sessionId),
    });
    if (error) throw new Error(error.message);
    const next = data?.next;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (next?.email && resendKey) {
      const link = `https://firma.veryfacil.org/r/${id}?turn=${encodeURIComponent(next.token)}`;
      const from = Deno.env.get("RESEND_FROM_EMAIL");
      if (!from) throw new Error("El remitente de correo no está configurado.");
      const html = `<div style="margin:0;background:#f5f6f2;padding:32px 16px"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #dce5df;border-radius:16px;padding:32px;font-family:Arial,sans-serif;color:#102c25"><p style="margin:0 0 24px;font-size:20px;font-weight:700">LeapSign</p><p style="margin:0;color:#29705c;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Turno disponible</p><h1 style="margin:10px 0 16px;font-size:28px">Ya puedes continuar</h1><p>Hola ${escapeHtml(String(next.holder_name ?? ""))},</p><p style="line-height:1.65;color:#53665e">Tu acceso está activo durante 10 minutos. Descarga la versión vigente, fírmala y vuelve a incorporar el PDF desde el mismo enlace.</p><p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#124d40;color:#fff;padding:13px 18px;border-radius:9px;text-decoration:none;font-weight:700">Abrir mi documento</a></p><hr style="border:0;border-top:1px solid #e6ece8;margin:28px 0 18px"><p style="margin:0;color:#75827c;font-size:12px;line-height:1.5">Documento privado · No reenvíes este correo ni el enlace de acceso.</p></main></div>`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [next.email],
          subject: "LeapSign · Ya puedes firmar",
          html,
        }),
      });
      if (!response.ok)
        console.error("No se pudo enviar el aviso de turno", response.status);
    }
    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400, headers: cors },
    );
  }
});
