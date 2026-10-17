# Seguridad de CadenaPDF

Este repositorio requiere infraestructura independiente de LeapSign: nunca usar
su proyecto Supabase ni su nombre de Worker. Revisar `docs/security-audit.md`.
Las operaciones facturables de Edge pasan por `_shared/economic-guard.ts` y la
reserva atómica `reserve_security_budget`; no introducir rutas de correo/carga
que eviten estos controles. Los límites internos no garantizan un tope de factura.
Ejecutar `npm test` y `npm run build`. Las migraciones, despliegues y cambios de
recursos reales requieren autorización expresa. Mantener funcionalidades y PDF
firmados intactos y probar consumo únicamente con datos sintéticos.
