# FAMITENLY Mobile (prototipo)

App nativa para familias (iOS primero, también Android), hecha con Expo (React Native).
**Usa solo datos de ejemplo.** No se conecta al servidor real ni a la base de datos.

## Probarla en tu iPhone (Expo Go)

Necesitas: tu Mac, tu iPhone y que los dos estén en la **misma red Wi‑Fi**.

1. En el iPhone, instala **Expo Go** desde la App Store (gratis).
2. En el Mac, abre **Terminal** y pega, una línea cada vez:

   ```bash
   cd ~/family-portal
   git fetch origin
   git checkout claude/project-thread-lozsbx
   git pull
   cd mobile
   npm install
   npx expo start
   ```

3. Aparece un **código QR** en la Terminal. Ábrelo con la **cámara** del iPhone y toca el aviso "Abrir en Expo Go".
4. La primera carga tarda 1–2 minutos. Después, cualquier cambio se recarga solo.

### Si algo falla

- **"Could not connect" o se queda cargando:** para el servidor (Ctrl + C) y arráncalo con `npx expo start --tunnel`.
  La primera vez puede pedir instalar `@expo/ngrok`: responde `y`.
- **"Project is incompatible with this version of Expo Go":** actualiza Expo Go en la App Store. El proyecto usa el SDK 58.
- **`npm: command not found`:** instala Node.js LTS desde https://nodejs.org y vuelve al paso 2.

## Cómo probar

- Entrar: cualquier correo y contraseña (la contraseña `wrong` simula un error). Código de dos pasos: cualquiera de 6 cifras menos `000000`.
- **Family → Settings → Prototype options**: simula plan Essential (sin IA), límite mensual de IA, sin datos, errores de red y modo sin conexión.

## Para desarrolladores

```bash
npm run typecheck   # TypeScript
npm test            # pruebas (vitest)
npx expo export -p ios   # comprobar que compila para iOS
```

Estructura: `src/app` (rutas de Expo Router), `src/screens`, `src/components`, `src/theme`,
`src/services` (API falsa; se cambiará por la API móvil real en la Fase 4), `src/data/sample.ts`.
