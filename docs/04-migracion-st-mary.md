# Migración de St. Mary al portal nuevo

Pasos para cargar el contenido del portal antiguo (`stmarycommunication.javiercela.me/Portal_202627/`). Se hacen una vez, desde el panel del colegio en producción, con la cuenta del School Owner.

## 1. Permitir subidas directas en R2 (una vez)

Los archivos de más de 3 MB van del navegador directamente a R2. R2 solo los acepta si el bucket lo permite.

1. Entra en [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**.
2. Abre el bucket privado (el de `R2_PRIVATE_BUCKET`).
3. **Settings** → **CORS Policy** → **Add CORS policy** (o **Edit**).
4. Pega esto y guarda:

```json
[
  {
    "AllowedOrigins": ["https://family-portal-brown.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Cuando el colegio tenga dominio propio, añade esa dirección a `AllowedOrigins` (por ejemplo `"https://portal.stmarylittleton.com"`).

Límite conocido: si alguien sube un archivo grande y cierra la página antes de terminar, el archivo queda en R2 sin documento. Ocupa espacio en R2 pero no cuenta en el espacio del plan.

## 2. Calendario 2026‑27 (132 eventos)

Archivo: `st-mary-calendario-2026-27.ics` (se genera con `npx tsx scripts/st-mary-calendar.cts`).

1. Admin → **Calendar & Events** → **Import**.
2. Elige el archivo, deja "Import into: School Calendar" y la zona `America/Denver`. **Check file**.
3. Revisa el resumen: deberían salir 132 eventos nuevos. Si sale "Possible duplicate", es un evento que ya creaste a mano con el mismo título y fecha: déjalo sin marcar.
4. **Import and publish**.

Importar el mismo archivo otra vez no duplica nada: actualiza lo que cambió.

## 3. Documentos (22 PDF)

Los PDF están en el Drive de communication@, carpeta `Portal_202627` → `assets` → `documents` (la subcarpeta `SMEED` y el folleto `schooleatery.pdf` aparte). Descárgalos al Mac.

En Admin → **Documents** → **Upload several**, sube una tanda por categoría. Antes de pulsar **Upload and publish**, cambia el título de cada fila al de la columna "Título".

### Forms to return

| Archivo | Título |
|---|---|
| 2026-27_Milk_Order_Form.pdf | Milk Order Form |
| Physical_Exam_Form.pdf | Physical Exam Form |
| Authorization to Administer Medication.pdf | Authorization to Administer Medication |
| SMEED/SMEED Form.pdf | SMEED Form |
| 2026-27_Family_Covenant_Agreements.pdf | Family Covenant Agreements |

### Handbooks & policies

| Archivo | Título |
|---|---|
| 2026-2027_Parent_Handbook.pdf | Student Handbook 2026–27 |
| 2026-2027_Parent_Handbook_Preschool.pdf | Preschool Handbook 2026–27 |
| SMEED/SMEED Handbook 26-27.pdf | SMEED Handbook 2026–27 |
| Cell_Phone_Policy.pdf | Cell Phone Policy (Middle School) |

### Health & safety

| Archivo | Título |
|---|---|
| Medical_Information_26-27.pdf | Health Information 2026–27 |
| SMEED/SMEED Emergency Information.pdf | SMEED Emergency Information |

### Preschool

| Archivo | Título |
|---|---|
| Preschool Uniform 26-27.pdf | Preschool Uniform 2026–27 |
| Preschool Dictionary.pdf (4,7 MB: va por subida directa) | Preschool Dictionary |
| Map Preschool Drop Off.pdf | Preschool Drop-Off Map |

### Academics

| Archivo | Título |
|---|---|
| Calendar_2026-27.pdf | Academic Calendar 2026–27 |
| SchoolSupplyList26-27.pdf | School Supply List by Grade |
| 6th Grade.pdf | Summer Math, incoming 6th grade |
| 7th Grade.pdf | Summer Math, incoming 7th grade |
| 8th Grade.pdf | Summer Math, incoming 8th grade |

### Flyers

| Archivo | Título |
|---|---|
| schooleatery.pdf | School Eatery 2026–27 |

### En el Drive pero no en el portal antiguo

`VIRTUS_Registration_Instructions.pdf` y `HowToServiceHoursFACTS.pdf` están en la carpeta pero el portal no los enlazaba. Súbelos solo si el colegio quiere publicarlos.

### Lo que no es un PDF

- **Curriculum Standards** es un enlace externo (denvercatholicschools.com). Va en Quick access (paso 5).
- **Manual en HTML** (`handbook.html`, `preschool-handbook.html`): el PDF cubre el mismo contenido. Pasarlo a una página con índice es opcional.

## 4. Voluntariado (12 oportunidades)

Archivo: `st-mary-volunteer.json` (carpeta `fase6` de los archivos del proyecto). No está en el repositorio porque lleva emails y teléfonos personales de voluntarios.

1. Admin → **Modules** → activa **Volunteer**.
2. Admin → **Volunteer** → **Import**.
3. Elige el archivo y pulsa **Import and publish** (o **Import as drafts** para dejarlas en borrador).
4. Debería decir "12 added". Si lo importas otra vez, salta las que ya existen por título.

Por defecto solo las ven las familias con sesión iniciada. Los visitantes ven un aviso para iniciar sesión.

## 5. Botón FACTS y accesos rápidos

Hazlo después de subir los PDF, porque varios enlaces apuntan a ellos.

1. Admin → **Modules** → activa **Quick Links**.
2. Admin → **Links** → **New link**, una vez por fila:

| Dónde | Label | Link | Nueva pestaña |
|---|---|---|---|
| Header button | FACTS Login | `https://sis.factsmgt.com/accounts/Account/Login` | Sí |
| Quick access | Student Handbook | `/d/` + link name del manual | No |
| Quick access | Health forms | `/documents` | No |
| Quick access | Supply list | `/d/` + link name de "School Supply List by Grade" | No |
| Quick access | Lunch menu | `/d/` + link name de "School Eatery 2026–27" | No |
| Quick access | Curriculum Standards | `https://www.denvercatholicschools.com/why-catholic-education/curriculum` | Sí |

El "link name" de cada documento está en Admin → **Documents** → abre el documento → campo **Link name** (por ejemplo `student-handbook-2026-27`). El link queda `/d/student-handbook-2026-27`.

El enlace "Teacher wishlists" del portal antiguo se añadirá cuando exista ese módulo.

## 6. Teacher wishlists y Staff favorites

Archivo: `st-mary-community.json` (carpeta `fase6`). Trae 18 listas de Amazon y 65 fichas del personal.

1. Admin → **Modules** → activa **Community**.
2. Admin → **Community** → **Import from file** → elige el archivo → **Import**. Debería decir "83 added".
3. Añade en Admin → **Links** un acceso rápido "Teacher wishlists" con el link `/community#wishlists`.

Cambios respecto al portal antiguo:
- Las fichas del personal solo las ven las familias con sesión iniciada. Antes las veía cualquiera con el enlace.
- **No se han copiado las alergias ni los cumpleaños.** El portal antiguo los mostraba en abierto y no consta que el personal aceptara publicarlos. Si el colegio lo confirma, se pueden añadir a mano en cada ficha.
- Hay tres nombres repetidos en dos equipos (Mrs. Guzman, Mrs. Roberts, Mrs. Weir) con cargos distintos. Se importan las dos fichas; revisa si son la misma persona y borra la que sobre.

## 7. Lo que falta (aún no se puede migrar)

Archivo del School Messenger (13 boletines) y el aviso automático "No school". Esos módulos todavía no existen en la plataforma.
