# Analítica de operaciones

Página **AI & Operations → Analytics** del admin. Muestra lo que el portal gestionó para la oficina en 7 días, 30 días, 90 días o 12 meses. Solo enseña recuentos y tiempos: ningún nombre, mensaje ni pregunta.

## Qué muestra

| Bloque | Qué cuenta |
|---|---|
| Tiempo ahorrado (estimación) | Avisos de ausencia enviados por internet, preguntas que la IA respondió con fuente sin pasarlas a la oficina, y elementos que una regla cerró sola. Cada cosa se multiplica por los minutos que el colegio indica |
| Volumen | Elementos de la bandeja por tipo y por semana; avisos por tipo; cancelados; marcados como introducidos en el SIS |
| Respuesta | Mediana de la primera respuesta y de la resolución (sin los cerrados automáticamente), % respondido en 24 h, abiertos y vencidos ahora |
| IA y automatización | Preguntas a la IA (página Ask y asistente), % respondidas con fuente, sin respuesta, pasadas a la oficina, valoraciones, coste por respuesta, borradores del asistente preparados y enviados |

Las pruebas del sandbox no cuentan.

## Lo que hay que saber

- [Seguro] El tiempo ahorrado es una **estimación**. El portal no ve las llamadas ni los correos que sustituyó. La página lo dice.
- Minutos por defecto: 3 por aviso de ausencia, 4 por pregunta respondida y 2 por elemento cerrado automáticamente. Son supuestos míos, no datos medidos. Cada colegio debe poner los suyos en **Your assumptions**.
- El dinero solo aparece si el colegio pone un coste por hora.
- Una respuesta de la IA que acaba pasándose a la oficina no cuenta como trabajo ahorrado.

## Quién la ve

- Ver: permiso `analytics.view`. Lo tienen School Owner, School Administrator y Read-Only Reviewer. No lo tienen Attendance Office ni Teacher.
- Cambiar los supuestos: permiso `modules.configure`.
- Las sesiones de soporte de la plataforma no la ven.

## Activarla

1. Super Admin: el colegio necesita el plan **Smart** o **Autonomous**. Los planes no cambian.
2. Admin del colegio → **Module Manager** → activa **Operations Analytics**.
3. Abre **AI & Operations → Analytics** y ajusta **Your assumptions**.
