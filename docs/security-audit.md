# Seguridad y consumo — 17 de octubre de 2026

Estado: **protecciones parciales en código; infraestructura independiente pendiente**.
El repositorio aún es una copia previa de LeapSign con Auth y correo, no una
implementación final del producto Lite.

Se detectaron URL/clave pública Supabase de LeapSign, su referencia fija de
despliegue y nombre de Worker. Se prepararon variables propias, rechazo del
backend de LeapSign y validación del proyecto antes de publicar. Worker:
`cadenapdf`. No debe desplegarse antes de configurar infraestructura independiente.

Las 11 funciones tienen guardas de método, cuerpo, solicitudes y operaciones
facturables. La nueva migración incluye cuotas atómicas de creación, cargas,
almacenamiento, correo y agenda. Valores iniciales: 100 creaciones/día global,
20/día y 20 activos/propietario; 500 MiB de subida/día global, 100 MiB/propietario,
2 GiB de almacenamiento vivo más reservas; 500 destinatarios/día y 5.000 por
ventana fija de 30 días. Solicitudes: 50.000/día global, 6.000/hora/endpoint y
1.200/hora/actor. Son configurables en `security_budget_settings`, con suspensión
por servicio y causa de bloqueo acotada. No equivalen a topes monetarios.

Los contadores son compartidos entre aplicaciones de una misma base; no existe
un contador entre bases independientes o cuentas Cloudflare no identificadas.
Las URLs firmadas se emiten con cuota de bytes y vigencia de 60 s, pero aún se
pueden reutilizar mientras sean válidas. Auth y REST directos necesitan revisión
de límites del proveedor y CAPTCHA; el WAF del frontend no cubre el origen Supabase.

Verificación local: 29 pruebas, build, npm audit sin hallazgos y Deno typecheck de
las 11 funciones. El typecheck local resuelve Supabase 2.117.3 desde npm mediante
un import map, no acredita resolución JSR en producción. PostgreSQL 17 aislado
verificó reservas concurrentes, interrupción por servicio, almacenamiento, creación,
permisos y agenda. CI ejecuta la misma prueba SQL sin secretos de producción.

Para repetir SQL: `SECURITY_TEST_CONTAINER=<id> node scripts/test-security-database.mjs cadenapdf`
con un contenedor PostgreSQL temporal. Se rechaza sobrescribir una base existente.

No hay backend ni despliegue independiente verificados. No se aplicó la migración
`20261017010000_security_budgets.sql` a ningún servidor real. Resolver primero el
bootstrap histórico de `release_open_turn`, configurar URL/clave pública y la
variable de GitHub `SUPABASE_PROJECT_REF`, y revisar URLs/remitentes heredados de
LeapSign antes de publicar. Los secretos se configuran por vías seguras, nunca en chat.

Informe consolidado del entorno: `/workspace/security-audit/INFORME.md`.

## Publicación del código de protección

La consulta del 17/10/2026 al inventario autorizado sigue mostrando únicamente
Firmador. No se crea infraestructura facturable ni se modifica su base de datos.
El frontend, el workflow manual y las funciones Edge rechazan el backend de
LeapSign. La publicación de este código no es un despliegue de CadenaPDF.

Punto de restauración: etiqueta `restore/cadenapdf-before-security-2026-10-17`
y bundle local verificado en
`/workspace/restore-points/cadenapdf-before-security-2026-10-17.bundle`.
No se respaldan PDFs, según la decisión del propietario.
