# Firmador

Plataforma web en español para coordinar firmas electrónicas secuenciales de
PDF sin recibir certificados privados ni contraseñas.

## Estado del proyecto

Está implementado el núcleo de dominio con reglas de seguridad y una interfaz
inicial para crear un flujo dirigido. La firma libre se mantiene como módulo
separado y reutiliza los límites de documentos y la validación de cadena.

No se considera listo para producción todavía: faltan las credenciales y el
aprovisionamiento de Supabase Storage/Auth, Resend y una política de confianza
de pyHanko. El validador falla de forma segura si no está configurado; nunca
acepta una firma por inspección visual.

## Desarrollo

```bash
npm install --cache /tmp/firmador-npm-cache
npm run dev
npm test
npm run build
```

## Controles implementados y probados

- Flujo dirigido estricto: un solo firmante activo, plazos cerrados y máximo
  de 20 personas.
- Enlace y código de un solo uso almacenados únicamente como huellas.
- Rechazo de archivos no PDF, de más de 10 MB, repetidos, sin cadena válida o
  que invalide una firma previa.
- Cancelación y purga eliminan versiones y secretos de acceso en el modelo.
- Firma libre: clave de grupo con huella, bloqueo de 10 minutos y una firma
  máxima por certificado; un reporte pausa la ronda y libera el bloqueo.

## Integración de producción requerida

1. Implementar los adaptadores de persistencia en PostgreSQL/Supabase con RLS;
   los tokens, códigos y documentos no deben exponerse al navegador.
2. Ejecutar `validator/app.py` como servicio privado con pyHanko y una política
   explícita de confianza/revocación. El backend debe comparar la versión
   anterior antes de hacer una versión vigente.
3. Usar Storage privado y endpoints autenticados que revaliden permiso y
   estado, con `Cache-Control: no-store`; nunca URL públicas permanentes.
4. Configurar las tareas de recordatorio, vencimiento y purga; no adjuntar PDF
   en correo ni registrar su contenido.
