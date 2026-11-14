# Fase 1 — Auditoría del portal actual de St. Mary

Fecha: 12 de noviembre de 2026.

## Cómo se hizo y qué límites tiene

- La red de este entorno no permite descargar las páginas con `curl`, así que se leyeron con un lector web que devuelve el **texto** de la página, no el HTML.
- **No se vio:** el código HTML, CSS y JavaScript, los colores reales, las fuentes, el favicon ni de dónde salen los datos del calendario.
- **No se tuvo acceso:** a los archivos fuente locales, al hosting de `stmarycommunication.javiercela.me` ni a ningún panel de administración.
- Todo lo que aparece abajo se vio en las páginas. Donde algo no se pudo comprobar, se dice.

**Actualización (12 nov, 11:30 MT):** se revisó el código fuente desde Google Drive (`stmary-portal-202627_1.zip` y la carpeta `Portal_202627`). Ver "Hallazgos en el código fuente" más abajo. La carpeta `Test_Portal` estaba vacía al consultarla.

## Páginas revisadas

| Página | URL | Resultado |
|---|---|---|
| Portal 2026‑27 (actual) | `/Portal_202627/portal_202627.html` | HTTP 200. Calendario y "This week" salen **vacíos** en el texto: probablemente se cargan con JavaScript. |
| Portal anterior | `/portal/0531525gfk2026.html` | HTTP 200. Contiene unas 150 fechas del curso 2026‑27 escritas en la página y 22 enlaces a documentos. |
| Archivo School Messenger | `/Portal_202627/messenger-archive_202627.html` | HTTP 200. La lista de boletines sale **vacía**: se carga con JavaScript desde un origen no visible. |
| Manual de padres 2026‑27 | `/Portal_202627/handbook_202627.html` | HTTP 200. ~140.000 caracteres de HTML con índice y buscador, más PDF de 0,8 MB. Solo el primer ~29 % se leyó literal. |
| Web del colegio | `littletoncatholicschool.com` | HTTP 200. Hecha en **Squarespace** (las imágenes salen de `squarespace-cdn.com`). |
| Documentación de Focus | `focus-parents.screenstepslive.com/a/1223788-portal` | HTTP 200. Solo inspiración funcional. |

Páginas enlazadas que no se abrieron: `volunteer-opportunities_202627.html`, `teacher-wishlists_202627.html`, `staff-favorites_202627.html`, `supply-list_202627.html`, `preschool-handbook.html`, `2627amazon.html`.

## Datos verificados de la escuela

| Dato | Valor | Dónde se vio |
|---|---|---|
| Nombre | St. Mary Catholic Virtue School | Portal y web |
| Dirección | 6833 S Prince St., Littleton, CO 80120 | Web y manual |
| Teléfono | (303) 798‑2375 | Portal 2026‑27 (enlace `tel:+13037982375` correcto) |
| Email oficina | officemanager@stmarylittleton.com | Portal 2026‑27 |
| Email comunicación | communication@stmarylittleton.com | Archivo Messenger |
| Horario | Monday–Friday, 7:30 a.m.–4:00 p.m. | Portal 2026‑27 |
| Cursos | Preschool a 8th grade (Preschool, K‑5, 6‑8) | Web |
| Parroquia | St. Mary Catholic Parish, stmarylittleton.org | Web |
| Archidiócesis | Archdiocese of Denver | Web y manual |
| Redes | Instagram `stmarycatholicvirtueschool`, Facebook `id=100064244336751` | Web |
| Logo blanco | `stmarycommunication.javiercela.me/portal/assets/logo_white.png` | Portal 2026‑27 |
| Logo horizontal | `images.squarespace-cdn.com/.../St.MarySchool_Horizontal.png` | Web |
| Colores | Navy #16335B, dorado #FCBC40, cerúleo #006D8F (enlaces), texto #333333, fondo suave #F4F8FA | `assets/css/portal-2627.css` |
| Tipografías | Inter (títulos) y Open Sans (texto), desde Google Fonts | `portal_202627.html` y CSS |
| Calendario de Google | `c_f07a110a…a92e@group.calendar.google.com` (público) | `CONFIG.googleCalendarId` en `portal_202627.html` |

## Problemas encontrados

1. **[Seguro] Contacto roto en el portal anterior:** el teléfono visible es (303) 798‑2375, pero el enlace llama a `+15551234567`. El email visible es officemanager@…, pero el enlace escribe a `families@stmary.edu`. En la versión 2026‑27 está corregido.
2. **[Seguro] Suscripción al calendario:** los botones salen como `#` en el HTML, pero el JavaScript los rellena con el calendario público de Google (`calendar.google.com/...?cid=` y `webcal://.../basic.ics`). Funcionan.
3. **[Seguro] Rutas inconsistentes:** conviven `/portal/assest/` (mal escrito), `/portal/assets/`, `/portal/assets/Documents/` y `/Portal_202627/assets/`. Un enlace (`2026-2027_Parent_Handbook_Preschool`) no tiene extensión. Varios nombres de archivo llevan espacios.
4. **[Seguro] La URL del portal anterior es "secreta"** (`0531525gfk2026.html`). No es control de acceso: cualquiera con el enlace lo ve. Las páginas tienen `noindex, nofollow`.
5. **[Seguro] No existe administración.** Cada cambio exige editar HTML y volver a subir archivos.
6. **[Probable] El portal está fuera del dominio del colegio** (`javiercela.me`), lo que no inspira confianza a las familias y complica el correo y el SSO.
7. **[Seguro] FACTS:** el portal enlaza a `sis.factsmgt.com/accounts/Account/Login`; la web del colegio enlaza a `accounts.renweb.com/...`. Son dos puertas distintas al mismo sistema.

## Hallazgos en el código fuente

- **[Seguro] Todo el contenido vive dentro del HTML como listas de JavaScript.** No hay base de datos ni panel. Por eso la migración es mecánica:
  - `EVENTS` en `portal_202627.html`: **132 eventos** con fecha, categoría (`noclasses`, `faith`, `academic`, `community`, `health`), título, detalle, etiquetas, enlace y fin opcional del aviso de "no school".
  - `DOCS`: **23 documentos** en 6 categorías (Forms to return, Handbooks & policies, Health & safety, Preschool, Academics, Flyers), con palabras clave para el buscador. Las categorías son distintas de las del portal anterior.
  - `OPPS` en `volunteer-opportunities_202627.html`: **12 oportunidades** con enlaces a SignUpGenius, Google Forms, emails y teléfonos.
  - `LISTS` en `teacher-wishlists_202627.html`: **18 listas** de Amazon por profesor y aula.
  - `STAFF` en `staff-favorites_202627.html`: fichas del personal con 12 campos (bebidas, snacks, alergias…) agrupadas en 7 equipos.
  - `assets/messenger/manifest.js`: **13 boletines** (el más reciente, 9 nov 2026). Cada uno es el HTML del email de Flocknote guardado en `assets/messenger/data/AAAA-MM-DD.html`, mostrado en un iframe.
- **[Seguro] Un aviso automático "No school"** aparece 14 días antes de cada día sin clase (`alertDays: 14`).
- **[Seguro] Privacidad:** `.htaccess` añade `X-Robots-Tag: noindex` a todo y `robots.txt` bloquea a los rastreadores de IA. No hay login: cualquiera con el enlace ve emails y teléfonos personales de voluntarios y las **alergias del personal**. En la plataforma nueva, Staff favorites y los contactos de voluntarios deberían ir detrás del login de familias.
- **[Seguro] El JS admite `?today=AAAA-MM-DD`** para probar fechas. Útil para comparar resultados durante la migración.

## Checklist de migración, función por función

Estado: ☐ pendiente · ◐ parcial · ☑ hecho (en la plataforma nueva).

| # | Función actual | Destino en la plataforma | Fase | Estado |
|---|---|---|---|---|
| 1 | Cabecera con logo y nombre | Tema + perfil del colegio | 2 | ☑ |
| 2 | Teléfono, email y horario de oficina | Perfil del colegio (tarjeta "Need the front office?") | 2 | ☑ |
| 3 | Pie con nombre y ciudad | Perfil del colegio | 2 | ☑ |
| 4 | Enlace "Skip to content" | Layout compartido | 2 | ☑ |
| 5 | Navegación superior (Messenger, Volunteer, Wishlists, Staff favorites) | Navegación configurable + módulos | 3–4 | ☐ |
| 6 | Botón FACTS Login | Quick Links (botón de cabecera) | 3–4 | ◐ (función lista; falta crearlo en producción) |
| 7 | Buscador "forms, events and policies" | Módulo Search | 4 | ☐ |
| 8 | "Popular": Handbook, Health forms, Supply list, Lunch menu, Wishlists | Quick Links (bloque Quick access) | 3–4 | ◐ (función lista; falta crearlos en producción; Wishlists espera su módulo) |
| 9 | "This week and next" | Bloque This Week (calendario, días configurables) | 3–4 | ☑ |
| 10 | Calendario mes/lista con leyenda por categorías | Calendar & Events | 3–4 | ☑ |
| 11 | 132 eventos 2026‑27 (`EVENTS`) y calendario público de Google | Importación (`.ics` generado desde `EVENTS`) | 3 / 6 | ◐ (archivo listo; falta importarlo en producción) |
| 12 | Suscripción ICS / Google Calendar | Feed ICS por calendario | 3 | ☑ |
| 13 | PDF del calendario completo | Documents | 3 / 6 | ◐ (subida lista; falta subir el archivo) |
| 14 | 23 documentos en 6 categorías (`DOCS`) | Documents + Resources | 3 / 6 | ◐ (subida de varios y de más de 4 MB lista; falta subir los archivos) |
| 15 | Manual HTML con índice, buscador y PDF | Pages (página larga con índice) + Documents | 3 / 6 | ◐ (páginas con índice listas; falta migrar el texto y el PDF) |
| 16 | Manual de Preschool (HTML + PDF) | Pages + Documents (audiencia Preschool) | 3 / 6 | ☐ |
| 17 | Archivo del School Messenger: 13 boletines HTML de Flocknote + `manifest.js` | Módulo Messenger | 4 / 6 | ☐ |
| 18 | Volunteer opportunities | Módulo Volunteer | 4 / 6 | ◐ (módulo e importación listos; falta importar en producción) |
| 19 | Teacher wishlists | Community | 4 / 6 | ◐ (módulo e importación listos; falta importar en producción) |
| 20 | Staff favorites | Community | 4 / 6 | ◐ (solo familias, sin alergias ni cumpleaños; falta importar en producción) |
| 21 | Supply list por curso | Pages (audiencia por curso) | 4 / 6 | ◐ (función lista; falta migrar el contenido) |
| 22 | Fechas límite de salud (vacunas, físico, medicación, Tdap 7th) | Action Required | 3 / 6 | ☐ |
| 23 | Aviso automático "No school" 14 días antes | Bloque Action Required / alerta | 4 | ☐ |

## Lo que se conserva tal cual

- Los textos y el tono ("Everything your family needs, in one place.", "We're here for your family.").
- Las categorías de documentos y de eventos.
- Las URLs actuales seguirán funcionando hasta que se apaguen de forma explícita: la migración (Fase 6) incluirá una tabla de redirecciones.
