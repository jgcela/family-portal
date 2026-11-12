# Arquitectura técnica

## Resumen

Un **monolito modular** en Next.js que sirve a muchas escuelas desde un solo despliegue. No hay microservicios.

| Pieza | Elección | Por qué |
|---|---|---|
| Aplicación | Next.js 16 (App Router) + TypeScript | Un solo proyecto para portal, admin y super admin; despliegue directo en Vercel. |
| Base de datos | PostgreSQL en Neon | Ya contratado. Postgres permite aislamiento por fila (RLS). |
| Acceso a datos | Drizzle ORM + driver `pg` | Esquema tipado y migraciones SQL revisables. `pg` permite transacciones interactivas, necesarias para RLS. |
| Login | Better Auth (en la propia base de datos) | Sin coste por usuario, con 2FA, sesiones en BD y límite de intentos. Los usuarios quedan en nuestra base, no en un tercero. |
| Archivos | Cloudflare R2 (compatible con S3): un bucket público para logos e imágenes y uno privado con URLs firmadas de corta duración para documentos. | Un solo proveedor, 10 GB gratis y sin coste por descarga. Neon no guarda archivos. |
| Correo | Resend (Fase 3). | Invitaciones y recuperación de contraseña. |
| Pruebas | Vitest contra PostgreSQL real | Las pruebas de aislamiento solo valen si corren contra Postgres con RLS. |

Alternativas descartadas: **Clerk** (cobra por usuario y duplicaría nuestro modelo de escuelas y roles), **Auth.js** (2FA y contraseñas poco maduros), **Supabase** (ya elegiste Neon).

## Las tres aplicaciones

| Aplicación | Ruta | Quién entra |
|---|---|---|
| Family Portal | `stmary.<dominio>/` o `/s/stmary` | Público; familias con sesión ven más (Fase 4) |
| School Admin | `stmary.<dominio>/admin` | Miembros del colegio con `dashboard.view` |
| Platform Super Admin | `<dominio>/platform` | Solo usuarios en `platform_admins` |

Los permisos de plataforma y los de colegio están en tablas distintas. Un rol de colegio nunca da acceso a la plataforma, ni al revés.

## Multi-tenant

### Resolución de la escuela (`src/proxy.ts`)

1. `stmary.schoolportal.app` → la escuela sale del subdominio.
2. `portal.colegio.org` → dominio propio, solo si está **verificado** en `tenant_domains` (Fase 5).
3. `schoolportal.app/s/stmary` → "modo ruta", para `*.vercel.app` mientras no haya dominio con comodín.

En un host de escuela, las rutas `/s/...` y `/platform` devuelven 404: la escuela la decide el host, no la URL.

### Aislamiento en la base de datos (RLS)

- Cada tabla de escuela tiene `tenant_id NOT NULL` y una política `tenant_isolation`.
- El código que actúa para una escuela usa `withTenant(tenantId, fn)`. Dentro de esa transacción la conexión pasa al rol `app_tenant` (sin `BYPASSRLS`, dueño de nada) y fija `app.tenant_id`.
- Sin `app.tenant_id`, las políticas no devuelven nada: **denegado por defecto**.
- Las referencias entre tablas de escuela usan claves foráneas compuestas `(tenant_id, id)`: aunque alguien se saltara RLS, no podría asignar a un miembro de A un rol de B.
- `tenant_id` sale siempre de la resolución en el servidor (host o dominio). Los contextos de autorización solo valen si los creó `loadAuthzContext()`; una copia o un objeto con otro `tenantId` se rechaza.
- `platformDb()` (rol dueño, sin RLS) queda limitado a operaciones de plataforma: login, resolver el host, alta de escuelas, super admin y migraciones.

**Riesgo residual [Seguro]:** si alguien consiguiera ejecutar SQL arbitrario (inyección), podría hacer `RESET ROLE` dentro de la transacción. Drizzle parametriza todas las consultas y no hay SQL construido con texto del usuario. Para cerrarlo del todo, la aplicación debería conectarse con un usuario de base de datos que **sea** `app_tenant` y usar otro para las operaciones de plataforma. Está anotado para la Fase 7.

### Registros de plataforma y registros de escuela

| De la plataforma | De cada escuela (con RLS) |
|---|---|
| `tenants`, `tenant_domains`, `plans`, `subscriptions`, `platform_admins`, `support_grants`, `audit_logs` (filas sin escuela), tablas de login (`user`, `session`, `account`, `verification`, `two_factor`, `rate_limit`) | `school_profiles`, `tenant_settings`, `theme_versions`, `homepage_versions`, `academic_years`, `grades`, `audiences`, `audience_grades`, `roles`, `role_permissions`, `memberships`, `membership_roles`, `tenant_modules`, `navigation_items` |

La escuela puede **leer** su propia fila de `tenants`, `subscriptions` y `tenant_domains`, pero no cambiarlas. De `user` solo ve nombre y email de sus propios miembros. Las tablas de sesión y contraseñas le son inaccesibles.

Las tablas de contenido (eventos, calendarios, anuncios, documentos, páginas, etc.) llegan en la Fase 3 con el mismo patrón: `SELECT app_protect_tenant_table('nueva_tabla')` en la migración.

## Permisos (RBAC)

- Permisos con forma `recurso.acción` en `src/server/rbac/permissions.ts`; es la única lista válida.
- Ámbitos: **todo el colegio**, **un curso**, **una audiencia** o **lo propio** (`own`). Los permisos administrativos (marca, usuarios, dominios…) solo cuentan si se dan para todo el colegio.
- Denegado por defecto. Un registro dirigido a varios cursos exige permiso sobre todos.
- **Contra la escalada:** solo se puede repartir lo que uno tiene para todo el colegio; solo el Owner crea otros Owners; nadie salvo el Owner cambia sus propios roles; siempre queda al menos un Owner; los roles del sistema no se editan.
- **Separación de funciones:** con `independent_approval` activo, nadie aprueba su propio contenido.
- Roles por defecto: Owner/Principal, School Administrator, Communications Manager, Content Editor, Teacher, Volunteer Coordinator, Read‑Only Reviewer, Parent. Las escuelas pueden crear roles propios (p. ej. "Preschool Coordinator").

## Módulos

`src/server/modules/registry.ts` define cada módulo con: id, nombre, descripción, esquema de configuración (zod), permisos, dependencias, entrada de navegación, widgets de portada, tablas de datos y qué pasa al desactivarlo.

- `implemented: true` solo cuando el código existe. Hoy únicamente **Home** lo está; activar cualquier otro se rechaza con "not available yet".
- Para activar hace falta: estar implementado, incluido en el plan y con sus dependencias activas. Para desactivar: que nada dependa de él. **Desactivar nunca borra datos.**
- No hay plugins de terceros en tiempo de ejecución, a propósito.

## Motor de temas

- Un tema es un conjunto pequeño de *tokens* validados: 6 colores hex, 2 fuentes de una lista aprobada, radio de esquinas, estilo de cabecera y logos (solo `https` o rutas propias).
- Se compila a variables CSS. No se acepta CSS ni JavaScript de la escuela.
- Contraste: texto con fondo < 4,5:1 **bloquea la publicación**; colores de marca poco legibles generan aviso y la plataforma deriva automáticamente el color de texto y de enlaces legible.
- Versionado: un borrador y un publicado por escuela; al publicar, el anterior pasa a "archived" (base para "restaurar versión").

## Facturación

Planes y suscripciones están modelados (`plans`, `subscriptions`, módulos incluidos y extra, límites de almacenamiento y usuarios). **No hay cobro real.** Si se cancela una suscripción, solo queda Home. El precio es informativo hasta integrar un proveedor de pagos aprobado.

## Seguridad aplicada en la Fase 2

- Sesiones en base de datos, cookies `Secure` en producción, 2FA (TOTP) disponible.
- Contraseña mínima de 12 caracteres; **sin registro público** (solo por invitación, Fase 3).
- Límite de intentos de login guardado en BD (funciona aunque Vercel tenga varias instancias).
- Cabeceras: `nosniff`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, HSTS.
- Redirecciones tras login limitadas a rutas del propio portal.
- Registro de auditoría en la misma transacción que el cambio.

## Despliegue

Ver `README.md` (pasos para Vercel y Neon). Vercel Hobby es solo para uso no comercial: un SaaS de pago necesitará el plan Pro.
