import { describe, expect, it } from 'vitest';
import { acceptOpenUpload, createOpenRound, reportOpenError, takeOpenTurn, type Validation, type Version } from '../server/domain';
const base: Version={id:'v',digest:'base',signatureIds:[],createdAt:new Date()};
const valid=(digest:string, id:string):Validation=>({isPdf:true,size:500,digest,signatures:[{id,valid:true}],derivesFromCurrent:true,previousIntact:true});
describe('firma libre',()=>{
 it('asigna el turno a una sola persona',()=>{const r=createOpenRound(base,'clave'); takeOpenTurn(r,'Ana','clave'); expect(()=>takeOpenTurn(r,'Bea','clave')).toThrow('Otro participante');});
 it('expira el bloqueo en diez minutos sin renovación',()=>{const r=createOpenRound(base); const t=new Date(); takeOpenTurn(r,'Ana',undefined,t); const l=takeOpenTurn(r,'Bea',undefined,new Date(t.getTime()+600001)); expect(l.holder).toBe('Bea');});
 it('rechaza un certificado que ya firmó',()=>{const r=createOpenRound(base); takeOpenTurn(r,'Ana'); acceptOpenUpload(r,'Ana',valid('one','cert-A')); takeOpenTurn(r,'Ana'); expect(()=>acceptOpenUpload(r,'Ana',valid('two','cert-A'))).toThrow('segunda firma');});
 it('pausa la ronda y libera el turno cuando se informa un error',()=>{const r=createOpenRound(base); takeOpenTurn(r,'Ana'); reportOpenError(r,'Bea','La firma anterior no coincide'); expect(r.status).toBe('paused_error'); expect(r.lock).toBeUndefined(); expect(()=>takeOpenTurn(r,'Cris')).toThrow('no está disponible');});
});
