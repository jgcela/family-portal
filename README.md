# Family Portal

## Base de datos (Neon Postgres, plan gratuito)

1. Crea una cuenta en https://neon.tech y un proyecto nuevo (plan Free).
   Alternativa: en Vercel, *Storage > Marketplace > Neon*, que además crea `DATABASE_URL` en el proyecto de Vercel.
2. En *Connect* copia la cadena de conexión (`postgresql://...`).
3. `cp .env.example .env` y pégala en `DATABASE_URL`.
4. `npm install`
5. `npm run db:check` debe imprimir "Conexión con Neon correcta".

`.env` está en `.gitignore`: no subas la cadena de conexión al repositorio.

Neon solo da la base de datos. El login de usuarios y el almacenamiento de archivos (fotos, documentos) habrá que resolverlos aparte.
