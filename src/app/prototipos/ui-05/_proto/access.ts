// UI-05-DESIGN — Los prototipos solo existen en `next dev` local. Cualquier
// build de producción (`next start`, CI) y cualquier despliegue de Vercel
// (preview o production) responde 404 aunque la ruta se compile.
export function uiPrototypesEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && !env.VERCEL && !env.VERCEL_ENV;
}
