# Estado de implementación

Última actualización: 12 de noviembre de 2026 (Fase 2).

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
| Invitaciones y recuperación de contraseña | Pendiente: necesita proveedor de correo | — |
| RBAC con ámbitos, anti‑escalada, separación de funciones | Hecho | 19 pruebas unitarias + 12 de servicios contra BD |
| Roles personalizados | Servicio hecho; pantalla pendiente (Fase 3) | Probado contra BD |
| Registro de módulos, reglas de activación y planes | Hecho | 5 pruebas |
| Motor de temas con validación de contraste | Hecho | 7 pruebas (contraste y tokens) |
| Editor visual de tema | Hecho (Fase 3, ver abajo) | Pruebas + navegador |
| Alta de escuela (`provisionTenant`) y St. Mary como primer tenant | Hecho (`npm run db:seed`) | Probado |
| Pantallas: portal (portada + contacto), admin (panel, matriz de permisos, módulos), super admin (lista de escuelas) | Hecho, solo lectura | Revisadas en navegador a 1280 px y 390 px |

Resultado de pruebas: `npm test` → **57 de 57** pasan. `npm run typecheck` y `npm run build` sin errores.

## Fase 3 — Administración (en curso)

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

Resultado de pruebas: `npm test` → **112 de 112** pasan.

## Lo que todavía no existe (no simulado)

Documentos, Messenger, búsqueda, directorio, voluntariado, notificaciones, cuentas de familia, asistente de alta de escuelas, sesiones de soporte, métricas de sistema, exportación de datos y pagos. En el gestor de módulos aparecen como "Coming later".

## Bloqueos y riesgos abiertos

1. **Privacidad del contenido actual:** alergias del personal y teléfonos personales de voluntarios están públicos para quien tenga el enlace.
2. **Contraseña de Neon expuesta en el chat:** hay que hacer "Reset password" antes de guardar datos reales.
3. **Almacenamiento de archivos y correo:** decidido Cloudflare R2 para archivos y Resend para correo; faltan las cuentas.
4. **Dominio de la plataforma:** para subdominios por escuela hace falta un dominio propio apuntado a Vercel. Mientras tanto, modo ruta (`/s/stmary`).
5. **Vercel Hobby** no permite uso comercial.
