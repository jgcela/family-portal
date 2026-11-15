# Avisos de ausencia, bandeja de la oficina y flujos

Guía para el colegio y pasos de puesta en marcha. Todo lo de esta guía está en los planes que ya incluían estas funciones: avisos de ausencia y bandeja en Essential; reglas de flujo (Workflows) a partir de Smart.

## Qué hace

- **Familias** (con sesión iniciada): en el portal aparecen **Report an absence** y **My requests**.
  - Avisan de una ausencia, un retraso o una salida anticipada de un hijo vinculado a su cuenta. Eligen un motivo genérico (enfermedad, cita médica, motivo familiar, otro); el formulario pide no dar diagnósticos.
  - Reciben un número de referencia (R-1001…) y ven el estado: Received → Being reviewed → Accepted / Not accepted, o Cancelled.
  - Pueden cancelar un aviso hasta que pasa su último día.
  - Pueden escribir a la oficina ("Contact the office") y, si el asistente de IA no encuentra una respuesta, enviar esa pregunta a la oficina con un botón.
  - Ven las respuestas de la oficina en la página de cada solicitud. **No se envía correo todavía**: hace falta configurar el proveedor de correo (Resend).
- **Oficina** (admin → AI & Operations):
  - **Inbox**: todo lo que llega, con responsable, estado, prioridad, fecha límite e historial. Filtros, vistas guardadas, acciones en bloque, plantillas de respuesta, notas internas (las familias no las ven) y tiempos medios de respuesta.
  - **Students**: alumnos y cuentas de familia vinculadas. Cada vínculo dice si esa cuenta puede avisar ausencias y ver al alumno. Un vínculo **restringido** (orden de custodia) quita todo acceso y exige una nota que solo ve el personal que gestiona alumnos.
  - **Workflows**: reglas a partir de plantillas: a quién va cada solicitud, en cuántas horas vence, cuándo se escala y a quién, y qué avisos simples se aceptan solos (por ejemplo, un día de enfermedad). Las plantillas de permisos de excursión, acuse del manual, voluntariado, formularios y recogida de documentos aparecen como "Coming later" porque necesitan el módulo de formularios, que no existe aún.

## Lo que no hace (todavía)

- **No escribe en FACTS ni en ningún SIS.** Al aceptar un aviso, la oficina lo introduce en el SIS como siempre y pulsa "I entered it in the SIS". El estado "In school records" queda reservado para cuando exista un conector verificado (Fase 5).
- No envía correos ni SMS.
- No escribe en FACTS. Lee de FACTS qué alumnos tiene cada familia (sin guardarlos), y solo cuando FACTS dé el acceso: ver `docs/09-facts.md`.

## Quién ve qué

| Persona | Ve | Puede |
|---|---|---|
| Familia | Solo sus propias solicitudes y los hijos vinculados a su cuenta | Avisar, escribir, cancelar |
| Profesor (rol Teacher, limitado a su grado) | Alumnos y solicitudes de su grado | Ver; revisar avisos de su grado |
| Attendance Office | Según el ámbito que se le dé (todo el colegio o grados) | Revisar avisos, gestionar la bandeja |
| School Admin / Owner | Todo | Todo, incluidos vínculos y restricciones |
| Sesión de soporte de la plataforma | Nada de alumnos ni solicitudes | — |

Cada cambio queda en la auditoría.

## Puesta en marcha (paso a paso)

1. **Módulos**: Admin → **Module Manager** → activa **Operations Inbox** y **Attendance Notices**. En Smart o Autonomous, activa también **Workflows**.
2. **Alumnos**: Admin → **Settings → Student records**. Elige de dónde salen los hijos de cada familia:
   - **FACTS** (recomendado para St. Mary): se leen de FACTS cada vez, sin guardar un listado. Pasos en `docs/09-facts.md`.
   - **Listado del colegio** (respaldo, para colegios sin SIS conectado): aparece el menú **Students** con la importación CSV (`first_name, last_name, grade, sis_id, guardian_emails`).
   - Mientras no elijas ninguno, las familias no pueden avisar ausencias.
3. **Custodias**: con FACTS, bloquea en **Student records → Access blocks** las combinaciones familia‑alumno que no deben actuar. Con el listado del colegio, marca el vínculo como **Restricted** con su nota.
4. **Personal de asistencia**: Admin → **Staff** → da el rol **Attendance Office** a quien revise avisos.
5. **Reglas** (opcional, Smart o superior): Admin → **Workflows** → **Use template** en "Attendance notices to the attendance office", elige responsable y actívala. Si quieres, añade "Accept one-day illness absences automatically" con un número de orden menor.
6. **Plantillas de respuesta**: Admin → **Inbox** → **Reply templates**.
7. **Prueba** con una cuenta de familia de prueba: avisa una ausencia, revísala en la bandeja y comprueba lo que ve la familia.
8. **Vercel**: no hace falta ninguna variable nueva. Se añade un segundo cron diario (`/api/cron/operations`) que usa el mismo `CRON_SECRET` de la guía de IA. Si no pusiste `CRON_SECRET`, las escaladas se comprueban igualmente cada vez que alguien abre la bandeja.

## Límites

- Una familia puede enviar hasta 20 avisos y 10 solicitudes al día; más allá se le pide llamar.
- Avisos hasta 14 días después y 120 días antes; ausencias de más de 14 días, por teléfono.
- Cada regla que se aplica cuenta como una "automatización" del plan. Si se agotan, las solicitudes siguen llegando a la bandeja con los valores por defecto (sin asignar, vencen en 24 h).
