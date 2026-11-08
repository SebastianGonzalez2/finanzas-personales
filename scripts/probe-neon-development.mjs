import console from "node:console";
import process from "node:process";
import { probeDevelopmentDatabase } from "../src/db/development.mts";
import { DevelopmentConfigError } from "../src/server/neon-development-config.mts";

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--direct")) {
    throw new DevelopmentConfigError();
  }
  console.log(
    JSON.stringify(
      await probeDevelopmentDatabase(
        args[0] === "--direct" ? "direct" : "pooled",
      ),
    ),
  );
} catch (error) {
  const pending = error instanceof DevelopmentConfigError;
  console.error(
    pending
      ? "PENDIENTE: confirmar proyecto/development y configurar .env.local según docs/development-neon.md."
      : "FALLÓ: conexión development no verificada; detalles sensibles omitidos.",
  );
  process.exitCode = pending ? 2 : 1;
}
