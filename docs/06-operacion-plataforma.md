# Guía de operación de la plataforma

Esta guía es para el dueño de la plataforma y su equipo. Cubre lo que se hace desde `/platform` y lo que se hace fuera, en Vercel, Neon y Cloudflare. Cada colegio se gestiona desde su propio panel: ver [`05-school-admin-guide.md`](05-school-admin-guide.md).

## 1. Dónde vive cada cosa

| Pieza | Servicio | Qué guarda |
|---|---|---|
| Aplicación | Vercel, proyecto `family-portal` | El código. Cada fusión en `main` despliega y aplica las migraciones pendientes |
| Base de datos | Neon (Postgres) | Colegios, cuentas, contenido y registro de actividad |
| Archivos | Cloudflare R2: un bucket público (logos, imágenes) y uno privado (documentos) | Los documentos privados se sirven con enlaces firmados de corta duración |
| Web comercial | Vercel, proyecto `family-portal-mkt` (carpeta `marketing/`) | Los planes y precios. Cada despliegue de producción los copia a la tabla de planes |

## 2. Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión *pooled* de Neon |
| `BETTER_AUTH_SECRET` | Firma de las sesiones. Si cambia, todo el mundo tiene que volver a entrar |
| `PLATFORM_NAME` | Nombre que se muestra en el panel de plataforma |
| `PLATFORM_ROOT_DOMAIN` | Dominio raíz para subdominios (`stmary.<dominio>`). No pongas `vercel.app` |
| `AUTH_EXTRA_HOSTS` | Hosts extra donde se permite entrar (el `*.vercel.app` y los dominios propios de los colegios) |
| `ALLOW_PATH_TENANTS` | Permite `/s/<colegio>` mientras no haya dominio con comodín |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET` | Archivos |

Después de cambiar una variable hay que volver a desplegar: Vercel → Deployments → el último → **Redeploy**.

Las claves no se escriben nunca en un chat, un correo o el repositorio.

## 3. Dar de alta un colegio

1. `/platform` → **New school**. El asistente pide, en 6 pasos, el nombre y la dirección del enlace, los colores, el curso escolar y los cursos, el primer administrador, el plan con sus módulos y una revisión final.
2. Al terminar sale un **enlace de invitación** para el primer administrador. Sirve una vez y caduca a los 7 días. Mándaselo tú, porque la plataforma todavía no envía correos.
3. El colegio queda **En preparación**. Cuando el administrador haya aceptado la invitación, pulsa **Launch school** en la ficha del colegio.
4. Si el colegio se queda sin dueño (alguien se va), en la ficha se puede emitir otra invitación de School Owner.

**Suspender** un colegio cierra su portal, su panel y las altas de familias, pero no borra nada. **Reactivate school** lo vuelve a abrir.

## 4. Ayudar a un colegio (acceso de soporte)

1. En la ficha del colegio, pide acceso: escribe el motivo, elige las áreas ("Contenido y ajustes" y/o "Personas") y la duración (2, 8, 24 o 72 horas).
2. El School Owner lo aprueba en su panel (Settings → Support access).
3. Mientras dure, entras en su panel en **solo lectura**. Un aviso fijo muestra cuándo termina.
4. El colegio y tú podéis cortarlo antes. Todo queda en los dos registros de actividad.

No hay forma de entrar en un colegio sin su aprobación, ni siquiera para el owner de la plataforma.

## 5. Revisar el estado (System health)

`/platform/health` muestra datos reales de la base de datos: colegios por estado, pagos atrasados, pruebas que terminan, espacio usado, importaciones con errores, accesos de soporte, dominios pendientes y eventos de seguridad.

Lo que no cubre:
- **Errores de la aplicación:** Vercel → proyecto → **Logs**.
- **Base de datos:** Neon Console → **Monitoring**.
- **Correo:** no hay proveedor conectado.

## 6. Dominio propio de un colegio

1. El School Owner añade el dominio en su panel y crea los registros TXT y CNAME.
2. Cuando su panel diga "Verified", añade el dominio en Vercel → proyecto → Settings → **Domains**.
3. Añade el mismo dominio a `AUTH_EXTRA_HOSTS`, separado por comas, y vuelve a desplegar.

Sin el paso 3 el portal abre, pero no se puede iniciar sesión en ese dominio.

## 7. Equipo de plataforma

`/platform/team`: añade cuentas que ya existen y elige su rol: Owner (todo, incluido el equipo), Operator (colegios, planes y estado) o Support. Support solo ve los colegios y pide accesos de soporte. Siempre queda al menos un owner.

## 8. Planes

Los nombres, precios y funciones de los planes salen de `marketing/src/config/site.ts`. Para cambiar un precio, cambia ese archivo y fusiona. El espacio por plan (10, 25 y 100 GB) está en `src/server/billing/catalog.ts`.

No hay cobro real. El estado de facturación de cada colegio (al día, atrasado, cancelado) se marca a mano en su ficha.

## 9. Copias de seguridad y recuperación

- **Neon** guarda un historial que permite volver la base de datos a un momento anterior: Neon Console → **Branches** → **Restore**. En el plan gratuito el historial cubre poco tiempo; revisa cuánto en Neon → Settings antes de contar con él.
- **R2** no tiene copias por defecto. Un documento borrado desde el panel se borra también del bucket.
- **Código:** GitHub. Para deshacer un despliegue malo: Vercel → Deployments → uno anterior que funcionaba → **Promote to Production**. Ojo: eso no deshace las migraciones de base de datos que ya se aplicaron.

## 10. Tareas pendientes de seguridad

1. **Contraseña de Neon:** se pegó en un chat. Haz **Reset password** en Neon y actualiza `DATABASE_URL` en Vercel antes de meter datos reales de familias.
2. **Inicio de sesión en dos pasos:** el login ya lo pide a quien lo tenga activado, pero todavía no hay ninguna pantalla para activarlo. Hasta que exista, el equipo de plataforma entra solo con contraseña.
3. **Vercel Hobby** no permite uso comercial. Antes de cobrar a un colegio, pasa a Pro.

## 11. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "Storage not configured" al subir | Faltan variables R2 en Vercel | Añádelas y vuelve a desplegar |
| La subida de archivos grandes falla | El bucket no tiene la regla CORS | Paso 1 de `04-migracion-st-mary.md` |
| No se puede iniciar sesión en un dominio nuevo | El dominio no está en `AUTH_EXTRA_HOSTS` | Apartado 6 |
| Alguien olvidó su contraseña | No hay recuperación por correo | Hoy no hay solución desde los paneles: es una limitación conocida |
| El despliegue falla en "migrate" | Una migración no se pudo aplicar | Vercel → el despliegue → **Build Logs**; no fusiones más cambios hasta arreglarlo |
