# Alumnos desde FACTS

Los hijos de cada familia se leen de FACTS cuando la familia los necesita (al avisar una ausencia o escribir a la oficina). El portal **no guarda un listado de alumnos**. En cada aviso o solicitud queda solo:

- la clave del alumno en FACTS (`facts:9001`),
- su nombre y su grado en ese momento, para que la oficina tenga el registro.

Si FACTS cambia algo (un alumno que se va, una custodia nueva), el portal lo ve en la siguiente consulta. Puede tardar hasta 5 minutos, porque las respuestas se guardan en memoria ese tiempo para no llamar a FACTS en cada clic.

## Lo que NO está verificado

[Seguro] Esta conexión está construida a partir de guías públicas de otros proveedores (Reach, PlusPortals, Gradelink). No se ha probado contra un FACTS real porque hacen falta claves que solo da FACTS.

| Dato | Lo que se sabe | Fuente |
|---|---|---|
| Cabeceras de la API | `Ocp-Apim-Subscription-Key` (del proveedor) y `Facts-Api-Key` (del colegio) | Guía de Reach |
| Permiso necesario | "People" | Guía de Reach |
| Rutas | `/People`, `/Students`, `/People/ParentStudent` | Guía de Reach |
| URL base | **No publicada.** Se pone en `FACTS_API_BASE_URL` | — |
| Filtros y nombres de campos | **No publicados.** El código acepta varias formas (`personId`, `PersonID`…) | Supuesto |
| Inicio de sesión con FACTS (SSO) | El "FACTS SSO" que usan otros proveedores va del proveedor **hacia** FACTS (entrar en FACTS sin volver a escribir la contraseña). Ninguna fuente pública muestra que FACTS haga de proveedor de identidad para otras webs | PlusPortals, Gradelink |

Por eso:

- La familia entra con su cuenta del portal. El portal busca en FACTS a la persona con **el mismo correo**. Solo vale una coincidencia exacta y única. Si un padre usa otro correo en FACTS, la oficina pone su ID de FACTS a mano.
- En cuanto FACTS confirme la URL, los filtros y los nombres de campos, hay que ajustar un único archivo: `src/server/sis/facts.ts`.

## Seguridad

- No se pide nunca a las familias su contraseña de FACTS.
- Solo se hacen lecturas (GET). El portal no escribe nada en FACTS.
- La clave del colegio se guarda cifrada (AES‑256‑GCM) y atada a ese colegio. Nadie puede volver a verla, tampoco el administrador.
- Quién puede actuar por qué alumno lo decide el servidor con lo que responde FACTS, no el navegador.
- Si FACTS marca la relación como sin custodia o sin acceso al portal, ese alumno no aparece. [Suponiendo] Los nombres de esos campos (`custody`, `familyPortalAccess`…) están sin confirmar.
- **Bloqueos**: la oficina puede bloquear a una cuenta para un alumno aunque FACTS los relacione (por ejemplo, una orden de custodia). La nota solo se ve en esa pantalla.

## Planes

La lectura de alumnos desde FACTS va incluida con los avisos de ausencia (Essential). La línea "Supported SIS integrations" de Autonomous queda para lo que va más allá: escribir la asistencia en FACTS, notas, horarios. No se ha cambiado nada de los planes.

## Paso a paso

### 1. Pedir el acceso a FACTS (tú)

Escribe a tu contacto de FACTS o a su soporte. Puedes copiar este texto:

> Subject: API access for St. Mary's parent portal (read-only, People scope)
>
> Hello,
>
> St. Mary Catholic Virtue School is setting up a parent portal that needs to read, from FACTS SIS, which students each parent is linked to. It will only read data (no writes) and only from the People area.
>
> Could you help us with:
> 1. A subscription key (Ocp-Apim-Subscription-Key) for the FACTS SIS API for our portal provider, or the steps to join your partner program.
> 2. The API base URL and the documentation for /People, /Students and /People/ParentStudent: how to filter People by email and ParentStudent by parent, and the field names in the responses.
> 3. Whether the parent–student relationship includes custody or portal-access flags, and their names.
> 4. Whether FACTS can act as a single sign-on provider (OpenID Connect or SAML) so parents can sign in to a third-party portal with their FACTS account.
>
> Thank you.

### 2. Crear la clave del colegio en FACTS (alguien de St. Mary con acceso de administrador a FACTS)

1. En FACTS: **System → Configuration → API Configuration**.
2. Crea una clave nueva. Nombre: `Family Portal`. Permisos: **People**, solo lectura. No marques nada más.
3. Copia la clave. No la pegues en el chat ni la enseñes en capturas de pantalla.

### 3. Poner la clave de FACTS del proveedor en Vercel (tú, cuando FACTS te la dé)

1. Abre https://vercel.com → proyecto **family-portal** → **Settings → Environment Variables**.
2. Añade `FACTS_SUBSCRIPTION_KEY` con la clave que te dé FACTS. Entorno: **Production**.
3. Añade `FACTS_API_BASE_URL` con la URL que te dé FACTS. Debe empezar por `https://`.
4. **Deployments** → el último → **Redeploy**.

### 4. Conectar St. Mary (en el admin del colegio)

1. Admin → **Settings → Student records**.
2. Marca **FACTS**, pega la clave del paso 2 y pulsa **Save**.
3. Pulsa **Test the connection**. Debe decir **Connected**.
4. Prueba con una cuenta de familia cuyo correo coincida con el de FACTS: en el portal, **Report an absence** debe mostrar sus hijos.
5. Si un padre no ve a sus hijos, en **Student records → Matching families to FACTS** elige su cuenta y escribe su ID de FACTS.

## El listado manual

Sigue existiendo como respaldo, apagado por defecto. Solo aparece el menú **Students** si en **Student records** se elige "A list the school keeps in the portal". Los colegios que ya tenían alumnos cargados siguen con su listado hasta que cambien la opción.
