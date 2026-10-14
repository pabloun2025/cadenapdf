# Base del sistema

## Propósito

LeapSign permite crear enlaces privados para revisar y firmar documentos PDF. La
base del sistema está pensada para que varias personas puedan esperar su turno
sin que el documento ni el proceso de firma queden expuestos antes de tiempo.

Este documento diferencia el entregable que se está construyendo ahora de las
capacidades que requieren una fase posterior. No sustituye una validación legal
ni criptográfica de una firma.

## Arquitectura objetivo

```text
Navegador
  ├─ aplicación web estática (Cloudflare Workers)
  └─ enlace de ronda / autenticación

Supabase
  ├─ Auth: cuentas de creadores
  ├─ Postgres: rondas, turnos, cola y auditoría
  ├─ Storage privado: PDFs originales y resultados
  └─ Edge Functions: creación, acceso, turnos y notificaciones

Servicios privados
  └─ validador/firma: operación de firma y comprobaciones sensibles

Resend
  └─ notificaciones transaccionales a personas en espera
```

Principios de diseño:

- Los PDFs se guardan en almacenamiento privado y se acceden mediante URLs de
  duración limitada.
- Las claves privadas, credenciales y material de firma no llegan al navegador.
- Un turno activo es exclusivo y tiene caducidad.
- El cliente presenta el estado; el servidor decide acceso, orden y permisos.
- Cada acción relevante debe poder rastrearse sin guardar secretos en la
  auditoría.

## Entregable actual

La entrega actual cubre la base funcional para crear y compartir rondas, y para
organizar el acceso por turnos. Su objetivo es validar el flujo de usuario, no
declarar una firma electrónica final.

### Autenticación de creadores

Los creadores se registran e inician sesión con Supabase Auth. Solo un creador
autenticado puede crear y administrar sus rondas.

**Criterios de aceptación**

- Una persona puede crear cuenta e iniciar sesión.
- El enlace de confirmación usa el dominio público de la aplicación, no
  `localhost`.
- Una persona no autenticada no puede crear una ronda.

### Rondas abiertas

Una ronda abierta contiene un PDF, un título, un mensaje opcional y,
opcionalmente, una clave de acceso. Se comparte con una URL específica de ronda.

**Criterios de aceptación**

- El creador puede cargar un PDF y generar un enlace de ronda abierta.
- El enlace requiere la clave correcta cuando la ronda la tiene configurada.
- La interfaz no presenta al usuario textos ni pasos que no sean necesarios
  para avanzar.

### Firma por turnos

Una persona que entra a una ronda puede tomar turno. Si existe un turno activo,
queda en una cola con posición visible. Cuando le corresponde, obtiene un acceso
temporal al documento; al terminar puede liberar el turno.

**Criterios de aceptación**

- Dos personas no pueden tener un turno activo de la misma ronda a la vez.
- La cola conserva una posición por persona y evita duplicados de la misma
  sesión.
- Un turno activo caduca después de un periodo definido.
- La pantalla se actualiza periódicamente mientras una persona espera.
- El PDF no se entrega desde la interfaz antes de que el turno esté activo.

### Notificaciones

La persona en espera puede dejar un correo opcional. Al liberarse un turno, la
siguiente persona con correo puede recibir un aviso transaccional con el enlace
de la ronda.

**Criterios de aceptación**

- El correo es opcional y se valida antes de guardarse.
- La clave de Resend se conserva como secreto de servidor; no se envía al
  navegador ni se guarda en el repositorio.
- La aplicación sigue funcionando si el proveedor de correo no está disponible.
- El envío se registra como evento, sin almacenar la clave ni el contenido
  sensible del documento.

### Despliegue

La interfaz se construye desde el repositorio y se publica en Cloudflare. Las
funciones y datos se ejecutan en Supabase.

**Criterios de aceptación**

- La compilación y las pruebas del proyecto finalizan correctamente antes de
  publicar.
- La URL de producción carga la aplicación y las rutas de rondas.
- Las variables públicas contienen únicamente configuración apta para cliente.
- Los secretos de servidor se configuran fuera del repositorio.

## Trabajo posterior recomendado

### Fase 2 — Flujos dirigidos

El esquema de participantes, invitaciones, estados y notificaciones ya existe
en la base de datos, aislado de las rondas abiertas. La siguiente tarea conecta
ese esquema con funciones de servidor y una interfaz para el creador.

**Criterios de aceptación**

- El creador define una secuencia de hasta 20 participantes y sus plazos.
- Solo un participante dirigido puede tener una invitación activa.
- Los enlaces y códigos se guardan únicamente como huellas en el servidor.
- Los cambios de estado y de participantes se realizan mediante funciones de
  servidor autorizadas, no con actualizaciones directas desde el navegador.

### Fase 3 — Operación real de firma y validador privado

Incorporar un servicio privado para preparar el documento, ejecutar la firma y
validar el resultado. La aplicación no debe afirmar que una descarga o una
aceptación de turno equivale a una firma válida.

**Criterios de aceptación**

- El material criptográfico y las credenciales se mantienen fuera de
  Cloudflare, Supabase y el navegador cuando corresponda.
- El validador rechaza fallos de comprobación y no produce un documento marcado
  como firmado ante un error.
- El sistema entrega un resultado verificable y guarda los metadatos técnicos
  mínimos de validación.
- La interfaz muestra claramente estados como pendiente, en proceso, firmado o
  fallido.

### Ciclo de vida y purga programada

La eliminación inmediata solicitada por el creador, la finalización y el
rollback ya retiran las versiones descartadas del acceso y procesan la limpieza
del almacenamiento. Sigue siendo recomendable acordar una política temporal y
una ejecución programada para procesos abandonados.

**Criterios de aceptación**

- Cada ronda tiene una fecha o política de expiración explícita.
- Las rondas vencidas no emiten nuevas URLs de documento.
- Un trabajo programado elimina o archiva los archivos de acuerdo con la
  política aprobada.
- Se conserva únicamente la información de auditoría definida después de la
  purga.

### Auditoría ampliada y administración

Agregar una vista para creadores y un registro de eventos para investigar el
ciclo de una ronda sin exponer documentos ni secretos.

**Criterios de aceptación**

- Se registran creación, acceso autorizado, toma y liberación de turno,
  notificación, firma, error y expiración.
- Cada evento incluye fecha, identificador de ronda y actor o sesión cuando sea
  pertinente.
- Solo el creador autorizado puede consultar la auditoría de su ronda.
- La auditoría no contiene claves de acceso, tokens, URLs firmadas completas ni
  contenido del PDF.

### Notificaciones resilientes ante caducidad sin navegador

Completar el aviso para promociones causadas tanto por una liberación manual
como por caducidad. Esto necesita un proceso programado o un mecanismo de
eventos de servidor; el sondeo del navegador por sí solo no puede avisar a una
persona que ya cerró la página.

**Criterios de aceptación**

- La siguiente persona recibe como máximo un aviso por promoción de turno.
- Una caducidad activa la promoción y notificación sin depender de que un
  navegador siga abierto.
- Los reintentos del proveedor de correo no duplican notificaciones.
- El mensaje usa un dominio y remitente verificados para destinatarios reales.

## Límites actuales

- El flujo de turnos organiza el acceso, pero todavía no reemplaza un proceso
  de firma digital validada.
- Los PDF se almacenan de forma privada durante el proceso; LeapSign no ofrece
  cifrado de extremo a extremo ni debe describirse como un sistema que «no
  almacena nada».
- La personalización de los correos de confirmación de Supabase depende de un
  proveedor SMTP configurado; el proveedor predeterminado puede imponer
  limitaciones de plan.
- El aviso de turno no debe prometerse como garantizado hasta contar con el
  proceso de promoción programado y un remitente de correo verificado.

## Decisiones pendientes

Antes de una puesta en producción que procese firmas reales se debe acordar:

1. El tipo de firma requerido y el marco legal aplicable.
2. La identidad de los firmantes y el método de verificación.
3. Duración de turnos, rondas y retención de documentos.
4. El proveedor o infraestructura para claves y validación.
5. El dominio remitente de correo y el contenido transaccional aprobado.
