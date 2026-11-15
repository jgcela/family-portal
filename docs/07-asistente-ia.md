# School Knowledge AI: guía de uso y puesta en marcha

Responde preguntas de familias con lo que el colegio ha publicado y aprobado. Cada respuesta enseña la fuente y la frase exacta en que se basa. Si no encuentra la respuesta, lo dice y muestra a quién preguntar.

## Qué hace y qué no

- Solo usa fuentes aprobadas por el personal. Lo que no esté aprobado no existe para el asistente.
- Respeta la visibilidad: un visitante solo ve contenido público; una familia, también el de sus grados; el personal, todo lo publicado.
- Esta página pública ("Ask") no ve datos de alumnos. El asistente privado de familias (abajo) sí ve los hijos y solicitudes de la familia que ha iniciado sesión, y nada más.
- No da consejo médico ni legal. En emergencias remite al colegio o al 911.
- El servidor comprueba cada cita. Si el modelo cita algo que no está en la fuente, la respuesta se descarta.

## Puesta en marcha en producción (paso a paso)

### 1. Crear la clave de Anthropic

1. Entra en https://console.anthropic.com y crea una cuenta (o inicia sesión).
2. Ve a **Settings → Billing** y añade un método de pago. Pon un límite mensual bajo para empezar (por ejemplo 20 USD) en **Settings → Limits**.
3. Ve a **Settings → API Keys → Create Key**. Nombre: `family-portal-production`.
4. Copia la clave (empieza por `sk-ant-`). Solo se muestra una vez. No la pegues en el chat ni la enseñes en capturas.

### 2. Guardar la clave en Vercel

1. Abre https://vercel.com, entra en el proyecto **family-portal** (no el de marketing).
2. **Settings → Environment Variables → Add New**.
3. Key: `ANTHROPIC_API_KEY`. Value: la clave. Environments: solo **Production**. Guarda.
4. Añade otra variable: Key `CRON_SECRET`, Value una cadena larga al azar (por ejemplo, escribe 40 letras y números sin pensar). Environment: **Production**. Vercel la usa para llamar al refresco diario.
5. Opcionales: `AI_MODEL` (por defecto el modelo más capaz; `claude-haiku-5-5` es unas 40 veces más barato y menos preciso) y `AI_EFFORT` (`low` por defecto).
6. Ve a **Deployments**, abre el último y pulsa **Redeploy** para que cargue las variables.

### 3. Activar el módulo para St. Mary

1. Super Admin → el colegio → plan **Smart** o **Autonomous** (Essential no incluye IA).
2. En el admin del colegio: **Modules** → activa **School Knowledge AI**.

### 4. Preparar las fuentes

1. Admin → **AI Control Center → Knowledge base → Check portal for changes**. Aparecen como sugeridas las páginas, anuncios y documentos publicados. Si quedan pendientes, púlsalo otra vez.
2. Revisa cada fuente. Marca **Authoritative** las que mandan (el handbook vigente) y pon la fecha de vigencia.
3. Selecciona las correctas y pulsa **Approve**. Solo se pueden aprobar fuentes ya indexadas.
4. Para respuestas que no están en ningún documento (horarios de oficina, uniforme), usa **New FAQ answer** (pregunta y respuesta) o **Paste text** (texto largo).

### 5. Probar antes de abrirlo a familias

1. **AI Control Center → Test**. Elige ver como visitante, como familia de un grado concreto o como personal.
2. Haz 10–15 preguntas reales que suelan llegar a la oficina. Comprueba que la cita respalda la respuesta.
3. Cuando una respuesta falte o esté mal, corrige la fuente (no el asistente) y vuelve a probar.

### 6. Abrirlo

**AI Control Center → Settings**: añade contactos de escalado por tema (por ejemplo, asistencia → oficina) y activa "Signed-in families" (y "Visitors who are not signed in" si quieres que lo usen visitantes). Aparecerá **Ask** en el menú del portal.

## Costes

Cada pregunta con el modelo por defecto cuesta del orden de 1–3 céntimos de dólar [estimación: unos 3.000–6.000 tokens de entrada y 300 de salida]. La pestaña **Quality & usage** muestra el gasto real del mes. Essential no incluye IA. Smart incluye 3.000 preguntas al mes: al 80 % se avisa y al 100 % el asistente deja de responder hasta el mes siguiente y pide contactar con la oficina, sin cobro extra. Autonomous es ilimitado; solo hay un tope técnico contra abusos (50.000 preguntas al mes por colegio, cambiable con la variable `AI_MONTHLY_SAFETY_CAP` o por colegio en Super Admin) que no se muestra como límite del plan.

## Privacidad

- Por defecto se guarda el texto de las preguntas 180 días para mejorar fuentes. Se puede desactivar o acortar en Settings.
- Solo el propietario de la cuenta del colegio puede leer preguntas concretas, indicando un motivo; cada lectura queda en la auditoría. El resto del personal ve solo estadísticas.
- Los datos enviados a Anthropic por la API no se usan para entrenar modelos según sus condiciones comerciales [verificar en el contrato antes de firmar con un colegio].
- Límite: 20 preguntas cada 10 minutos por persona o por IP.

## Asistente privado de familias (Fase 4)

Solo en el plan **Autonomous** (módulo **Family Assistant**). Las familias con sesión iniciada ven **Assistant** en el menú, en lugar de **Ask**.

### Qué puede hacer

| Herramienta | Qué hace | Necesita el módulo |
|---|---|---|
| `list_my_children` | Hijos de esta familia (de FACTS o del listado del colegio) | — |
| `list_my_requests`, `get_request` | Solicitudes y avisos de esta familia y su estado | Operations inbox |
| `search_school_info` | Busca en las fuentes aprobadas, con citas verificadas | School Knowledge AI |
| `upcoming_events` | Calendario visible para la familia | Calendar |
| `prepare_absence_notice` | Prepara un aviso de ausencia, retraso o salida | Attendance notices |
| `prepare_office_request` | Prepara un mensaje a la oficina | Operations inbox |

### Reglas que no dependen del modelo

- Cada herramienta corre con la identidad verificada de la familia. El modelo no ve claves ni decide permisos: si pide los datos de otra familia, el servidor responde "no existe".
- El modelo no puede enviar nada. Prepara un borrador; la familia lo revisa y pulsa **Send to the office**. Al pulsar, el servidor vuelve a comprobar el hijo, las fechas y los límites. Un borrador solo se puede enviar una vez y caduca a las 24 horas.
- Las conversaciones son privadas: ninguna pantalla del personal las muestra. El colegio ve solo cuántas preguntas se hicieron y su coste, nunca el texto. Se borran solas con el periodo de retención de **AI Control Center → Settings**. La familia puede borrar cada conversación.
- Las citas y las referencias R-… que se muestran las construye el servidor con lo que devolvieron las herramientas. Si el modelo inventa una cita, la respuesta no se muestra.
- 20 mensajes cada 10 minutos por persona; cuenta para el límite mensual de IA del plan.

### Ponerlo en marcha

1. Haz los pasos 1 y 2 de arriba (clave de Anthropic en Vercel). Sin clave, la página dice que el asistente no está activado.
2. Super Admin → el colegio → plan **Autonomous**.
3. Admin del colegio → **Modules** → activa **Family Assistant**.
4. Entra como una familia de prueba, abre **Assistant** y escribe, por ejemplo, "My child is sick tomorrow". Debe aparecer un borrador con **Send to the office** y **Discard**. Envíalo y comprueba que llega a **Inbox**.
