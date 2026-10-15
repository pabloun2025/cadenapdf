# Validador privado

Este servicio recibe exclusivamente dos PDF por petición: la versión vigente y
la versión candidata firmada. No guarda archivos, no expone documentación y no
debe publicarse en Internet.

El endpoint `POST /validate` permanece bloqueado con `503` hasta configurar:

1. política de confianza y revocación de certificados;
2. validación de firmas CMS/PAdES y `ByteRange` con pyHanko;
3. comparación incremental con la versión anterior;
4. límite de tiempo, autenticación de servicio a servicio y registro mínimo.

Solo tras una respuesta válida el backend de Firmador podrá crear una nueva
versión de documento. Una descarga, una subida o una apariencia visual nunca
equivalen a una firma válida.
