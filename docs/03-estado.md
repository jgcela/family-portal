# Estado de implementación

Última actualización: 12 de noviembre de 2026 (Fase 2).

## Fase 1 — Auditoría

| Entregable | Estado |
|---|---|
| Lectura de las 6 URLs indicadas | Hecho, solo texto (ver límites en `01-auditoria.md`) |
| Revisión del código fuente, CSS, JS y datos del calendario | **Bloqueado:** falta acceso a la carpeta local del portal |
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
| Editor visual de tema | Pendiente (Fase 3) | — |
| Alta de escuela (`provisionTenant`) y St. Mary como primer tenant | Hecho (`npm run db:seed`) | Probado |
| Pantallas: portal (portada + contacto), admin (panel, matriz de permisos, módulos), super admin (lista de escuelas) | Hecho, solo lectura | Revisadas en navegador a 1280 px y 390 px |

Resultado de pruebas: `npm test` → **57 de 57** pasan. `npm run typecheck` y `npm run build` sin errores.

## Lo que todavía no existe (no simulado)

Calendario, anuncios, documentos, páginas, Messenger, búsqueda, directorio, voluntariado, notificaciones, cuentas de familia, editor de portada, editor de tema, asistente de alta de escuelas, sesiones de soporte, métricas de sistema, exportación de datos y pagos. En el gestor de módulos aparecen como "Coming later".

## Bloqueos y riesgos abiertos

1. **Código fuente del portal actual:** sin él no se pueden verificar colores, fuentes ni migrar el calendario y el Messenger con exactitud.
2. **Contraseña de Neon expuesta en el chat:** hay que hacer "Reset password" antes de guardar datos reales.
3. **Almacenamiento de archivos y correo:** hay que crear cuentas (recomendado Vercel Blob o R2, y Resend) antes de la Fase 3.
4. **Dominio de la plataforma:** para subdominios por escuela hace falta un dominio propio apuntado a Vercel. Mientras tanto, modo ruta (`/s/stmary`).
5. **Vercel Hobby** no permite uso comercial.
