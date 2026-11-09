import process from "node:process";
import console from "node:console";
import { spawn } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

// Load in-process: Next dev forwards CLI --env-file to NODE_OPTIONS, which Node
// rejects. The child receives only the resulting private environment.
const root = new URL("../", import.meta.url);
try {
  process.loadEnvFile(fileURLToPath(new URL(".env.google.local", root)));
  if (
    process.env.GOOGLE_AUTH_ORIGIN !== "http://localhost:3000" ||
    process.env.DATABASE_URL !== "" ||
    process.env.DATABASE_URL_UNPOOLED !== ""
  )
    throw new Error();
  if (process.argv.includes("--test-login"))
    process.env.GOOGLE_AUTH_READY = "true";
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL("node_modules/next/dist/bin/next", root)),
      "dev",
      "--webpack",
      "--hostname",
      "localhost",
    ],
    { cwd: fileURLToPath(root), stdio: "inherit", env: process.env },
  );
  child.on("error", () => {
    console.error("No se pudo iniciar el servidor local");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
} catch {
  console.error(
    "Configuración Google local incompleta o insegura; valores omitidos",
  );
  process.exitCode = 1;
}
