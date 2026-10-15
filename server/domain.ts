import { createHash, randomBytes } from 'node:crypto';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const DEADLINES = [0.5, 1, 2, 5, 12, 24, 48] as const;
export type WorkflowStatus = 'draft' | 'active' | 'late' | 'final_review' | 'confirmed' | 'cancelled' | 'purged';
export type ParticipantStatus = 'pending' | 'active' | 'completed' | 'late' | 'skipped' | 'replaced';
export type Participant = { id: string; name: string; email: string; deadlineHours: number; status: ParticipantStatus; tokenHash?: string; codeHash?: string; expiresAt?: Date };
export type Version = { id: string; digest: string; signatureIds: string[]; createdAt: Date };
export type Workflow = { id: string; ownerId: string; title: string; message: string; status: WorkflowStatus; participants: Participant[]; versions: Version[]; audit: string[]; lastActivity: Date };
/** Controles operativos; LeapSign no interpreta firmas PAdES/CMS. */
export type Validation = { isPdf: boolean; size: number; digest: string; signatures?: { id: string; valid: boolean }[]; derivesFromCurrent?: boolean; previousIntact?: boolean };

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function hashSecret(value: string) { return sha(value); }
export function createDirected(ownerId: string, title: string, message: string, input: Pick<Participant, 'name'|'email'|'deadlineHours'>[]): Workflow {
  if (!title.trim() || input.length < 1 || input.length > 20) throw new Error('El flujo requiere entre 1 y 20 firmantes.');
  const emails = new Set<string>();
  for (const p of input) { if (!p.name.trim() || !/^\S+@\S+\.\S+$/.test(p.email) || !DEADLINES.includes(p.deadlineHours as typeof DEADLINES[number]) || emails.has(p.email.toLowerCase())) throw new Error('Firmantes inválidos, repetidos o con plazo no permitido.'); emails.add(p.email.toLowerCase()); }
  const now = new Date();
  return { id: crypto.randomUUID(), ownerId, title: title.trim(), message: message.slice(0, 500), status: 'draft', participants: input.map(p => ({ ...p, id: crypto.randomUUID(), status: 'pending' })), versions: [], audit: [`created:${now.toISOString()}`], lastActivity: now };
}
export function activate(workflow: Workflow, initial: Version): string {
  if (workflow.status !== 'draft' || initial.signatureIds.length) throw new Error('No se puede activar el trámite.');
  workflow.versions.push(initial); workflow.status = 'active'; return activateNext(workflow)!;
}
export function activateNext(workflow: Workflow): string | undefined {
  const next = workflow.participants.find(p => p.status === 'pending');
  if (!next) { workflow.status = 'final_review'; workflow.audit.push('final-review'); return; }
  const raw = token(); next.status = 'active'; next.tokenHash = sha(raw); next.codeHash = sha(token()); next.expiresAt = new Date(Date.now() + next.deadlineHours * 3_600_000); workflow.audit.push(`activated:${next.id}`); return raw;
}
export function authorizeSigner(workflow: Workflow, participantId: string, rawToken: string, oneTimeCode: string, now = new Date()): Participant {
  const p = workflow.participants.find(x => x.id === participantId);
  if (!p || p.status === 'skipped' || p.status === 'replaced') throw new Error('Tu firma ya no es necesaria para este trámite. No debes realizar ninguna acción.');
  if (workflow.status === 'cancelled' || workflow.status === 'purged') throw new Error('El trámite fue cancelado o eliminado y no requiere acción.');
  if (p.status !== 'active' || !p.tokenHash || sha(rawToken) !== p.tokenHash || !p.codeHash || sha(oneTimeCode) !== p.codeHash || !p.expiresAt || now > p.expiresAt) throw new Error('El enlace o código no es válido.');
  p.codeHash = undefined; return p;
}
export function acceptUpload(workflow: Workflow, participantId: string, validation: Validation) {
  const active = workflow.participants.find(p => p.status === 'active');
  const previous = workflow.versions.at(-1); if (!active || active.id !== participantId || workflow.status !== 'active') throw new Error('No es tu turno para firmar.');
  if (!validation.isPdf || validation.size < 1 || validation.size > MAX_PDF_BYTES || !previous || validation.digest === previous.digest) throw new Error('El PDF debe ser válido, no superar 10 MB y no repetir la versión anterior.');
  workflow.versions.push({ id: crypto.randomUUID(), digest: validation.digest, signatureIds: previous.signatureIds, createdAt: new Date() }); active.status = 'completed'; active.tokenHash = undefined; active.codeHash = undefined; workflow.lastActivity = new Date(); workflow.audit.push(`signed:${active.id}`); return activateNext(workflow);
}
export function alterPending(workflow: Workflow, actorId: string, participantId: string, action: 'skip'|'replace', replacement?: Pick<Participant,'name'|'email'|'deadlineHours'>) {
  if (!['active','late'].includes(workflow.status)) throw new Error('El flujo está bloqueado.'); const p = workflow.participants.find(x => x.id === participantId); if (!p || !['pending','active','late'].includes(p.status)) throw new Error('Solo se pueden modificar firmantes pendientes.');
  p.status = action === 'skip' ? 'skipped' : 'replaced'; p.tokenHash = undefined; p.codeHash = undefined; workflow.audit.push(`${action}:${actorId}:${p.id}`);
  if (replacement) { if (!DEADLINES.includes(replacement.deadlineHours as typeof DEADLINES[number])) throw new Error('Plazo inválido.'); workflow.participants.splice(workflow.participants.indexOf(p)+1,0,{...replacement,id:crypto.randomUUID(),status:'pending'}); }
  if (!workflow.participants.some(x=>x.status==='active')) return activateNext(workflow);
}
export function cancel(workflow: Workflow, actorId: string) { if (workflow.ownerId !== actorId) throw new Error('Sin permiso.'); workflow.status='cancelled'; workflow.versions=[]; workflow.participants.forEach(p=>{p.tokenHash=undefined;p.codeHash=undefined}); workflow.audit.push(`cancelled:${actorId}`); }
export function purge(workflow: Workflow) { workflow.status='purged'; workflow.versions=[]; workflow.participants=[]; workflow.audit.push('purged'); }

export type OpenRound = { id: string; status: 'open'|'locked'|'paused_error'|'completed'|'cancelled'|'purged'; versions: Version[]; groupKeyHash?: string; lock?: { holder: string; expiresAt: Date }; signedCertificates: string[]; reports: { reporter: string; comment: string; at: Date }[]; audit: string[] };
export function createOpenRound(initial: Version, groupKey?: string): OpenRound { return { id: crypto.randomUUID(), status:'open', versions:[initial], groupKeyHash:groupKey ? sha(groupKey) : undefined, signedCertificates:[], reports:[], audit:['open-created'] }; }
/** Debe ejecutarse como UPDATE condicional/lock de fila en la persistencia real. */
export function takeOpenTurn(round: OpenRound, holder: string, key?: string, now=new Date()) { if (round.status === 'cancelled' || round.status === 'purged' || round.status === 'paused_error') throw new Error('La ronda no está disponible.'); if (round.groupKeyHash && (!key || sha(key) !== round.groupKeyHash)) throw new Error('Clave de grupo inválida.'); if (round.lock && round.lock.expiresAt > now) throw new Error('Otro participante tiene el turno activo.'); round.lock={holder,expiresAt:new Date(now.getTime()+10*60_000)}; round.status='locked'; round.audit.push(`turn:${holder}`); return round.lock; }
export function acceptOpenUpload(round: OpenRound, holder: string, validation: Validation, now=new Date()) { const prior=round.versions.at(-1); if (round.status!=='locked'||!round.lock||round.lock.holder!==holder||round.lock.expiresAt<=now) throw new Error('El turno no está activo.'); if (!prior||!validation.isPdf||validation.size<1||validation.size>MAX_PDF_BYTES||validation.digest===prior.digest) throw new Error('El PDF debe ser válido, no superar 10 MB y no repetir la versión anterior.'); round.versions.push({id:crypto.randomUUID(),digest:validation.digest,signatureIds:prior.signatureIds,createdAt:now}); round.lock=undefined; round.status=round.versions.length>=21?'completed':'open'; round.audit.push(`open-signed:${holder}`); }
export function reportOpenError(round: OpenRound, reporter: string, comment: string) { if (!comment.trim()) throw new Error('El comentario es obligatorio.'); round.reports.push({reporter,comment:comment.trim(),at:new Date()}); round.status='paused_error'; round.lock=undefined; round.audit.push(`reported:${reporter}`); }
