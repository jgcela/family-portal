# Estado de implementación

Última actualización: 13 de noviembre de 2026 (Fase 3).

## Fase 1 — Auditoría

| Entregable | Estado |
|---|---|
| Lectura de las 6 URLs indicadas | Hecho, solo texto (ver límites en `01-auditoria.md`) |
| Revisión del código fuente, CSS, JS y datos del calendario | Hecho desde Google Drive (132 eventos, 23 documentos, 13 boletines) |
| Checklist de migración función por función | Hecho (`01-auditoria.md`) |
| Arquitectura | Hecho (`02-arquitectura.md`) |

## Fase 2 — Fundación

| Pieza | Estado | Probado |
|---|---|---|
| Esquema y migraciones (`drizzle/0000_init.sql`) | Hecho | Se aplica en Postgres 16 limpio |
| RLS y rol `app_tenant` (`drizzle/0001_rls.sql`) | Hecho | 13 pruebas de aislamiento entre escuelas |
| Resolución de escuela por subdominio y modo ruta | Hecho | Pruebas unitarias + prueba manual con servidor |
| Dominios propios | Modelado; resolución solo si `verified_at`. Falta flujo de verificación DNS | Pendiente (Fase 5) |
| Login email + contraseña, 2FA, límite de intentos | Hecho | Login real en navegador (contraseña incorrecta y correcta) |
| Invitaciones | Hecho por enlace (Fase 3, ver Personal). Envío por correo pendiente | Pruebas + navegador |
| Recuperación de contraseña | Pendiente: necesita proveedor de correo | — |
| RBAC con ámbitos, anti‑escalada, separación de funciones | Hecho | 19 pruebas unitarias + 12 de servicios contra BD |
| Roles personalizados | Hecho (Fase 3, ver Personal) | Pruebas + navegador |
| Registro de módulos, reglas de activación y planes | Hecho | 5 pruebas |
| Motor de temas con validación de contraste | Hecho | 7 pruebas (contraste y tokens) |
| Editor visual de tema | Hecho (Fase 3, ver abajo) | Pruebas + navegador |
| Alta de escuela (`provisionTenant`) y St. Mary como primer tenant | Hecho (`npm run db:seed`) | Probado |
| Pantallas: portal (portada + contacto), admin (panel, matriz de permisos, módulos), super admin (lista de escuelas) | Hecho, solo lectura | Revisadas en navegador a 1280 px y 390 px |

Resultado de pruebas: `npm test` → **57 de 57** pasan. `npm run typecheck` y `npm run build` sin errores.

## Fase 3 — Administración (cerrada el 13 nov 2026)

### Calendario y eventos (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Tablas `calendars`, `events`, `calendar_imports` con RLS y claves compuestas por escuela | Hecho | Pruebas: otra escuela no ve ni puede enlazar eventos, ni con SQL directo |
| Crear, editar, borrar eventos; todo el día o con hora; varios días; repetición (diaria, semanal, mensual o regla RFC 5545) con fechas excluidas | Hecho | Pruebas + navegador |
| Zonas horarias: se guarda el instante; las repeticiones se calculan en la hora local de la escuela (la misa de las 8:00 sigue a las 8:00 tras el cambio de hora) | Hecho | Pruebas con el cambio de hora del 1 nov 2026 |
| Flujo Borrador → En revisión → Aprobado → Publicado → Archivado; aprobación independiente si la escuela la exige | Hecho | Pruebas |
| Permisos por audiencia: un profesor de 5º solo crea y edita eventos de 5º; no puede ampliarlos a toda la escuela | Hecho | Pruebas |
| Importación ICS (Google, Outlook, Apple) y CSV con mapeo de columnas, vista previa, errores por fila, detección de duplicados y reimportación que actualiza en vez de duplicar | Hecho | Pruebas + navegador |
| Portal: vista mes y lista, filtro por curso y calendario, ficha del evento, "Add to Google Calendar", descarga .ics, suscripción por calendario | Hecho | Navegador a 1280 px y 390 px |
| Bloques "This Week" y "Upcoming events" en la portada | Hecho | Navegador |
| Activar y desactivar módulos desde el Module Manager | Hecho | Pruebas (servicio) |
| Suscripción a un calendario externo por URL (sincronización periódica) | Pendiente | — |

### Anuncios y páginas (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Anuncios con resumen, texto, urgente, fijado, audiencias, "mostrar desde" y "ocultar después" | Hecho | Pruebas + navegador |
| Aviso de urgentes en todas las páginas del portal y bloque "School Updates" en la portada | Hecho | Navegador |
| Páginas del colegio (manual, lista de material) con dirección propia, índice automático y audiencias | Hecho | Pruebas + navegador |
| Versiones de páginas: cada publicación guarda una copia que no se puede modificar (ni con SQL); las familias ven la última publicada mientras se edita un borrador; se puede volver a una versión anterior | Hecho | Pruebas |
| Flujo de aprobación compartido por eventos, anuncios y páginas | Hecho | Pruebas |
| Editor con vista previa. Solo Markdown: el HTML, los scripts y los enlaces `javascript:` se muestran como texto o se descartan | Hecho | Pruebas (intentos de inyección) + navegador |

### Tema y portada (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Editor de tema: colores, fuentes de una lista cerrada, esquinas, estilo de cabecera y logos (enlace https). Vista previa en vivo y avisos de contraste mientras se edita | Hecho | Navegador |
| El tema se guarda como borrador; no se puede publicar si el texto no llega a contraste 4.5:1 (WCAG AA). Historial con "usar como borrador" y "descartar borrador" | Hecho | Pruebas |
| Constructor de portada: mostrar u ocultar, ordenar, añadir y quitar bloques; ajustes por bloque (días, número de elementos); bloque de mensaje propio en Markdown seguro | Hecho | Pruebas + navegador |
| Validación de la portada en el servidor: ids únicos, un solo banner, ajustes con límites y sin claves desconocidas | Hecho | Pruebas |
| "Vista previa en el portal": quien puede editar ve el borrador real en el portal con un aviso; las familias siguen viendo lo publicado. El permiso se comprueba en cada visita | Hecho | Navegador (sesión de editor y sesión anónima a la vez) |
| Subir logos como archivo | Pendiente: llega con Documentos (R2) | — |
| Bloques por audiencia (solo para ciertos cursos) | Pendiente: necesita cuentas de familia (Fase 4) | — |

### Documentos (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Tablas `documents` y `document_versions` con RLS y claves compuestas; las versiones no se pueden modificar (ni con SQL) | Hecho | Pruebas |
| Archivos en un bucket privado de Cloudflare R2. En local, sin claves, se guardan en `.storage/` | Hecho | Pruebas (almacenamiento en memoria) + navegador (local) |
| Enlace estable `/d/<nombre>`: comprueba el acceso en cada visita y redirige a una URL firmada que caduca a los 5 minutos. La URL del almacenamiento nunca se muestra ni se guarda | Hecho | Pruebas + navegador |
| Tipos permitidos (PDF, Office, imágenes, texto, CSV) comprobados por el contenido real del archivo, no por lo que dice el navegador. Se rechazan HTML, SVG, ejecutables y archivos renombrados | Hecho | Pruebas |
| Versiones: subir una nueva mantiene el enlace; se puede volver a una anterior; las antiguas solo las descarga el personal | Hecho | Pruebas + navegador |
| Límite de almacenamiento del plan y límite de 4 MB por archivo (límite de Vercel para envíos al servidor) | Hecho | Pruebas |
| Documentos para grupos concretos: por ahora solo los abre el personal; las familias, con las cuentas de la Fase 4 | Parcial | Pruebas |
| Subida directa al almacenamiento para archivos de más de 4 MB | Pendiente | — |
| Prueba contra R2 real | Hecho en producción por el usuario (13 nov) | Producción |
| Página Documents en el portal, agrupada por categoría | Hecho | Navegador |

### Personal (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Tabla `invitations` con RLS; solo se guarda el hash del enlace | Hecho | Pruebas |
| Invitar con nombre, email, cargo, rol y ámbito (todo el colegio, un curso o una audiencia). Se genera un enlace de un solo uso que caduca a los 7 días y se muestra una sola vez | Hecho | Pruebas + navegador |
| Mismas reglas anti‑escalada que al asignar roles: nadie invita con permisos que no tiene; solo el propietario invita propietarios | Hecho | Pruebas |
| Aceptar: cuenta nueva (nombre y contraseña de 12+ caracteres) o cuenta existente; el email de la cuenta debe coincidir con el de la invitación | Hecho | Pruebas + navegador (invitar → aceptar → entrar al panel) |
| Límite de cuentas de personal del plan, contando invitaciones pendientes | Hecho | Pruebas |
| Lista del equipo: añadir y quitar roles, suspender, reactivar y quitar del colegio. Nadie se suspende o se quita a sí mismo; solo un propietario cambia a otro propietario | Hecho | Pruebas |
| Envío de la invitación por correo | Pendiente: necesita proveedor de correo (Resend) | — |
| Roles personalizados: crear desde cero o duplicando uno integrado, editar y borrar (solo si nadie lo tiene). Los roles integrados y el de propietario no se editan. Nadie añade ni quita permisos que no tiene; los permisos solo de propietario no entran en roles personalizados; un rol dado para un curso no puede ganar permisos de todo el colegio | Hecho | 7 pruebas + navegador (1280 y 390 px) |

### Despliegue

- Vercel aplica las migraciones de base de datos solo al publicar en producción (`scripts/vercel-build.mjs`). Las vistas previas de las PR no tocan la base de datos.

Resultado de pruebas: `npm test` → **137 de 137** pasan.

### Revisión de cierre (13 nov)

- Todas las acciones del servidor del panel comprueban la sesión y vuelven a comprobar permisos en el servicio; ninguna confía en un id de escuela enviado por el navegador.
- Todo el HTML que se muestra sale del renderizador de Markdown con lista blanca, y el CSS sale de tokens de tema validados. Los administradores no pueden inyectar CSS ni JavaScript.
- `npm test`: 137 de 137. `next build` sin errores.

Queda pendiente de la Fase 3, sin simular:
- envío por correo de invitaciones y recuperación de contraseña (Resend; falta la cuenta);
- subir logos como archivo;
- subida directa de archivos de más de 4 MB;
- suscripción periódica a calendarios externos.

## Fase 4 — Portal de familias (en curso)

### Cuentas de familia (hecho)

| Pieza | Estado | Cómo se comprobó |
|---|---|---|
| Familias como miembros de tipo `family` con sus cursos (`family_grades`); solicitudes en `family_requests`. RLS en ambas | Hecho | Pruebas |
| Alta: la familia entra en `/join` con el código del colegio, elige cursos y deja una nota para la oficina. Nada privado es visible hasta que la oficina aprueba | Hecho | Pruebas + navegador (móvil) |
| Panel People → Families: abrir o cerrar el alta, cambiar el código, aprobar (corrigiendo cursos) o rechazar, cambiar cursos, suspender y quitar | Hecho | Pruebas + navegador |
| "Quién puede verlo" en avisos, eventos, páginas y documentos: Todos (público), Familias (con sesión; todas o solo las de los cursos marcados) o Solo personal | Hecho | Pruebas: visitante, familia del curso, familia de otro curso y personal |
| El visitante solo ve lo público; los enlaces directos y los documentos siguen la misma regla. Las suscripciones de calendario (ICS) solo llevan eventos públicos | Hecho | Pruebas |
| Los documentos que antes eran "solo grupos" pasan a "Familias" de esos grupos (migración 0011) | Hecho | Migración |
| Cerrar sesión desde el portal; después de entrar, el personal va al panel y las familias al portal | Hecho | Navegador |
| Página **My family** (`/family`): cursos de la familia, próximos eventos de sus cursos, avisos y documentos para la familia, cambio de contraseña. Enlace en la cabecera; tras iniciar sesión, la familia llega aquí | Hecho | Navegador (390 y 1280 px) |
| Notas, asistencia y fichas de alumnos | No incluido: viven en el sistema del colegio (FACTS) y no hay integración. No se simula | — |
| Inicio de sesión único con el sistema del colegio (FACTS u otro) | Pendiente: hay que confirmar que el proveedor ofrece SAML u OpenID Connect a terceros. No se simula | — |
| Verificar el email de las familias | Pendiente: necesita correo (Resend). Mientras tanto la oficina comprueba cada solicitud | — |

Riesgo conocido: quien tenga el código puede *pedir* una cuenta con un email que no es suyo. No ve nada privado hasta que la oficina aprueba. Hay un límite de 300 solicitudes pendientes por colegio.

Resultado de pruebas: `npm test` → **143 de 143** pasan.

## Lo que todavía no existe (no simulado)

Messenger, búsqueda, directorio, voluntariado, notificaciones, cuentas de familia, asistente de alta de escuelas, sesiones de soporte, métricas de sistema, exportación de datos y pagos. En el gestor de módulos aparecen como "Coming later".

## Bloqueos y riesgos abiertos

1. **Privacidad del contenido actual:** alergias del personal y teléfonos personales de voluntarios están públicos para quien tenga el enlace.
2. **Contraseña de Neon expuesta en el chat:** hay que hacer "Reset password" antes de guardar datos reales.
3. **Correo:** R2 ya funciona en producción. Para el correo está decidido Resend, pero falta la cuenta.
4. **Dominio de la plataforma:** para subdominios por escuela hace falta un dominio propio apuntado a Vercel. Mientras tanto, modo ruta (`/s/stmary`).
5. **Vercel Hobby** no permite uso comercial.
