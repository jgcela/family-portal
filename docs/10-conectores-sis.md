# Conectores SIS: FACTS, PowerSchool, Infinite Campus y otros

El portal lee de cada sistema escolar (SIS) una sola cosa: **qué hijos tiene cada padre**. Con eso funcionan los avisos de ausencia, las solicitudes a la oficina y el asistente de familias. El portal no guarda un listado de alumnos. Solo guarda la clave del alumno y su nombre y grado en cada aviso.

Hay dos conectores:

| Conector | Sistemas | Qué hace falta |
|---|---|---|
| FACTS | FACTS SIS | Clave de partner de FACTS (la pone la plataforma) + API key del colegio. Ver `docs/09-facts.md` |
| OneRoster | PowerSchool, Infinite Campus, Skyward y cualquier SIS con API OneRoster 1.1 o 1.2 | Un cliente OAuth 2.0 que crea el administrador del SIS del colegio o distrito. **No hace falta acuerdo con el proveedor** |

## Qué puede hacer cada conector

La pantalla **Settings → Student records** muestra esta tabla. El portal no promete nada que no esté en ella.

| Función | FACTS | OneRoster |
|---|---|---|
| Ver los hijos de cada familia | Sí | Sí |
| Entrar con la cuenta del SIS | No | No |
| Escribir ausencias en el SIS | No | No |
| Leer notas | No | No |
| Leer horarios | No | No |

## Lo que NO está verificado

[Seguro] Ningún conector se ha probado contra un colegio real. OneRoster se probó contra un servidor OneRoster simulado: con un navegador real, la oficina lo configuró, la prueba de conexión dio "Connected" y una familia vio a sus dos hijos y envió un aviso.

| Punto | Lo que se sabe | Fuente |
|---|---|---|
| Autenticación | OAuth 2.0 client credentials. OneRoster 1.2 eliminó OAuth 1.0a. Algunos servidores 1.1 solo tienen OAuth 1.0a: **esos no funcionan** con este conector | Especificación OneRoster 1.2 (1EdTech); guía de Microsoft School Data Sync |
| Rutas | 1.1: `/ims/oneroster/v1p1/users`; 1.2: `/ims/oneroster/rostering/v1p2/users` | Especificación 1.2; Microsoft SDS |
| Padres y tutores | Son usuarios (rol `parent`, `guardian` o `relative`). El vínculo con el alumno va en `agents` | Microsoft SDS |
| Contactos opcionales | Muchos distritos **no publican** padres por OneRoster, o solo ponen el vínculo en la ficha del alumno. Una guía de Linewize dice que con PowerSchool no pudo sincronizar tutores | Microsoft SDS; Linewize |

Por eso la prueba de conexión (en 1.1) avisa si no llega ningún padre: "Connected, but no parent or guardian records came back". Si pasa, hay que pedir al administrador del SIS que incluya los contactos en la API OneRoster.

[Suponiendo] Si el SIS solo pone el vínculo en la ficha del alumno y no en la del padre, el conector no encontrará hijos. Arreglarlo requiere ver una respuesta real del distrito.

## Puesta en marcha con PowerSchool o Infinite Campus (paso a paso)

### 1. Pedir el acceso al administrador del SIS

Envía este correo al responsable del SIS del colegio o distrito (cambia lo que va entre corchetes):

> Hola, [nombre]:
>
> Vamos a usar el portal de familias de [colegio]. Necesitamos un acceso de solo lectura a la API OneRoster de [PowerSchool / Infinite Campus] para que cada familia vea a sus propios hijos al avisar una ausencia.
>
> ¿Podéis crear un cliente OAuth 2.0 (client credentials) con estos datos?
> - Versión OneRoster 1.1 o 1.2 (la que tengáis).
> - Solo lectura de rostering (usuarios), **incluyendo padres/tutores (contactos)**.
> - No necesitamos notas, horarios ni datos demográficos.
>
> Necesitamos que nos enviéis: la dirección de la API, la dirección del token, el client ID y el client secret. El secret enviadlo por un canal seguro, no en el mismo correo.
>
> Gracias.

### 2. Configurarlo en el portal

1. Entra en el admin del colegio → **Settings → Student records**.
2. En **Families' children come from**, marca la segunda opción (PowerSchool, Infinite Campus…).
3. En el bloque **OneRoster**:
   - **System**: el que uséis.
   - **OneRoster version**: la que os dijeron (1.1 o 1.2).
   - **API address**: la dirección que os dieron. Puede ser la parte antes de `/ims/oneroster` o la dirección completa.
   - **Token address**, **Client ID** y **Client secret**: tal cual. No los enseñes en capturas.
4. Pulsa **Save**. Debe salir "Saved."
5. Pulsa **Test the connection**. Debe salir "OneRoster answered. The connection works." Si sale el aviso de que no llegan padres, vuelve al paso 1 y pide que incluyan los contactos.

### 3. Probar con una familia

1. Entra en el portal con una cuenta de familia cuyo correo sea **el mismo** que tiene ese padre en el SIS.
2. Abre **Report an absence**. Deben aparecer sus hijos con su grado.
3. Si un padre usa otro correo en el SIS: **Student records → Matching families to OneRoster**, elige su cuenta y escribe su ID de OneRoster (sourcedId).

## Seguridad

- Las familias nunca escriben la contraseña del SIS en el portal ni en el chat.
- El secret se guarda cifrado (AES-256-GCM), atado al colegio, y no se vuelve a mostrar.
- Con los datos solo se hacen lecturas (GET). La única petición POST es para pedir el token de acceso.
- Solo se aceptan direcciones `https://`.
- Los bloqueos de custodia del portal se aplican encima de lo que diga el SIS. OneRoster no trae información de custodia.
- Cambiar las credenciales borra las coincidencias padre ↔ SIS guardadas, por si son de otro distrito.

## Dónde está el código

- `src/server/sis/connector.ts`: interfaz común y tabla de capacidades.
- `src/server/sis/oneroster.ts`: conector OneRoster.
- `src/server/sis/facts.ts`: conector FACTS.
- `src/server/services/directory.ts`: elige el conector del colegio y aplica bloqueos.
