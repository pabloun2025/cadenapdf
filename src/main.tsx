import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import './styles.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [title, setTitle] = useState(''); const [message, setMessage] = useState(''); const [key, setKey] = useState(''); const [document, setDocument] = useState<File | null>(null);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)); const { data } = supabase.auth.onAuthStateChange((_, next) => setSession(next)); return () => data.subscription.unsubscribe(); }, []);
  async function authenticate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setNotice('No se pudo iniciar sesión. Si es tu primera vez, crea una cuenta.'); setBusy(false); }
  async function signUp() { setBusy(true); const { error } = await supabase.auth.signUp({ email, password }); setNotice(error ? 'No se pudo crear la cuenta.' : 'Revisa tu correo para confirmar la cuenta.'); setBusy(false); }
  async function createRound() { if (!session) return; if (!title.trim() || !document) return setNotice('Escribe un título y selecciona un PDF.'); setBusy(true); const form = new FormData(); form.set('title', title); form.set('message', message); form.set('groupKey', key); form.set('document', document); const { data, error } = await supabase.functions.invoke('create-round', { body: form }); setNotice(error ? 'No se pudo crear la ronda.' : `Ronda creada. Enlace: /r/${data.id}`); setBusy(false); }
  if (!session) return <main><header><span className="mark">F</span><div><h1>Firmador</h1><p>Rondas de firma masiva</p></div></header><section className="card"><h2>Acceso del creador</h2><p className="hint">Los firmantes no necesitan cuenta ni correo.</p><form onSubmit={authenticate}><label>Correo<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>Contraseña<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required /></label><button className="primary" disabled={busy}>Entrar</button><button type="button" onClick={signUp} disabled={busy}>Crear cuenta</button></form>{notice && <p role="status">{notice}</p>}</section></main>;
  return <main><header><span className="mark">F</span><div><h1>Firmador</h1><p>Rondas de firma masiva</p></div><button onClick={() => supabase.auth.signOut()}>Salir</button></header><section className="card"><h2>Crear ronda</h2><p className="hint">El PDF se guarda privado y no se expone con enlaces públicos.</p><label>Título<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></label><label>PDF inicial<input type="file" accept="application/pdf,.pdf" onChange={e => setDocument(e.target.files?.[0] ?? null)} /></label><label>Mensaje común<textarea value={message} maxLength={500} onChange={e => setMessage(e.target.value)} /></label><label>Clave opcional del grupo<input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Compártela por separado" /></label><p className="warning">Solo una persona puede firmar a la vez durante 10 minutos. La clave se guarda como una huella, nunca legible.</p><button className="primary" onClick={createRound} disabled={busy}>Crear ronda</button>{notice && <p role="status">{notice}</p>}</section></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
