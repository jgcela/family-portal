# Family Portal — plataforma multi-escuela

Una sola aplicación que da a cada colegio su propio portal de familias, su panel de administración y, al dueño de la plataforma, un panel para gestionar todos los colegios. St. Mary Catholic Virtue School es el primer colegio.

Documentación:

- [`docs/01-auditoria.md`](docs/01-auditoria.md): auditoría del portal actual y checklist de migración.
- [`docs/02-arquitectura.md`](docs/02-arquitectura.md): arquitectura, aislamiento entre colegios, permisos, módulos y temas.
- [`docs/03-estado.md`](docs/03-estado.md): qué está hecho, probado y pendiente.

## Probarlo en tu Mac (paso a paso)

Necesitas Node.js 22 o superior (nodejs.org, versión LTS) y el proyecto clonado en `~/family-portal`.

1. Abre **Terminal** y entra en el proyecto:
   ```
   cd ~/family-portal
   git pull
   npm install
   ```
2. Abre el archivo `.env` (en la carpeta `family-portal`, con TextEdit) y comprueba que tiene tu `DATABASE_URL` de Neon. Añade estas líneas debajo:
   ```
   BETTER_AUTH_SECRET=pega-aqui-un-texto-largo-y-aleatorio-de-40-caracteres
   PLATFORM_ROOT_DOMAIN=localhost
   ALLOW_PATH_TENANTS=true
   SEED_OWNER_EMAIL=tu-email@ejemplo.com
   SEED_OWNER_PASSWORD=una-contraseña-de-12-o-más-caracteres
   SEED_OWNER_NAME=Tu Nombre
   ```
   Para el secreto puedes escribir en Terminal `openssl rand -base64 32` y copiar el resultado.
3. Crea las tablas y el colegio St. Mary:
   ```
   npm run db:migrate
   npm run db:seed
   ```
   Debe decir "Migrations applied." y "Created tenant St. Mary Catholic Virtue School".
4. Arranca la aplicación:
   ```
   npm run dev
   ```
5. En el navegador:
   - Portal de familias: http://stmary.localhost:3000
   - Administración del colegio: http://stmary.localhost:3000/admin (entra con el email y contraseña del paso 2)
   - Panel de plataforma: http://localhost:3000/platform

Para pararla, vuelve a Terminal y pulsa `Control + C`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca en modo desarrollo |
| `npm test` | Pruebas automáticas (necesitan PostgreSQL local, ver abajo) |
| `npm run typecheck` | Comprueba tipos de TypeScript |
| `npm run build` | Compila para producción |
| `npm run db:check` | Comprueba la conexión a la base de datos |
| `npm run db:generate` | Genera una migración tras cambiar `src/server/db/schema` |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:seed` | Crea planes, St. Mary y la primera cuenta |

### Pruebas

Las pruebas crean una base `family_portal_test` en un PostgreSQL local (no tocan Neon). Por defecto usan `postgres://postgres:postgres@localhost:5432/postgres`; cámbialo con `TEST_ADMIN_DATABASE_URL`.

## Publicar en Vercel (resumen)

1. En Vercel: **Add New → Project**, importa `jgcela/family-portal`.
2. En **Settings → Environment Variables** añade `DATABASE_URL` (la conexión *pooled* de Neon), `BETTER_AUTH_SECRET`, `PLATFORM_NAME`, `PLATFORM_ROOT_DOMAIN` y `AUTH_EXTRA_HOSTS` con el dominio `*.vercel.app` que te asigne Vercel.
3. Antes del primer despliegue ejecuta `npm run db:migrate` y `npm run db:seed` contra Neon desde tu Mac.
4. Sin dominio propio, St. Mary queda en `https://tu-app.vercel.app/s/stmary`.

Vercel Hobby es solo para uso no comercial.
