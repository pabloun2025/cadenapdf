export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/runtime-config.json') {
      if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        return new Response('Configuración pendiente', { status: 503 });
      }
      return Response.json(
        { url: env.SUPABASE_URL, key: env.SUPABASE_PUBLISHABLE_KEY },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return env.ASSETS.fetch(request);
  },
};
