import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) throw new Error('Faltan las variables públicas de Supabase.');

const run = promisify(execFile);
// Node fetch no adopta el proxy de este entorno. curl sí, por lo que esta
// prueba sigue la misma salida de red que usarán las integraciones del servidor.
await run('curl', [
  '--fail', '--silent', '--show-error', '--max-time', '20',
  `${url}/auth/v1/health`, '-H', `apikey: ${key}`, '-o', '/dev/null',
]);
console.log('Conexión con Supabase verificada.');
