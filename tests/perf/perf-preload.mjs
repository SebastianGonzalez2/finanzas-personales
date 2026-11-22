/* global performance */
// PERF-01: precarga de medición del servidor de pruebas. Registra la duración
// y el texto de cada consulta SQL en PERF_QUERY_LOG (una línea JSON por consulta).
import { appendFileSync } from "node:fs";
import process from "node:process";
import pg from "pg";
import "../support/finance-browser-pg.mjs";

const log = process.env.PERF_QUERY_LOG;
if (log) {
  const original = pg.Client.prototype.query;
  pg.Client.prototype.query = function patched(...args) {
    const config = args[0];
    const text = typeof config === "string" ? config : config?.text;
    const started = performance.now();
    const result = original.apply(this, args);
    if (result && typeof result.then === "function") {
      const done = () => {
        try {
          appendFileSync(
            log,
            `${JSON.stringify({
              at: Date.now(),
              ms: +(performance.now() - started).toFixed(2),
              sql: String(text ?? "")
                .replace(/\s+/g, " ")
                .slice(0, 160),
            })}\n`,
          );
        } catch {
          // sin almacenamiento: no afecta la medición
        }
      };
      result.then(done, done);
    }
    return result;
  };
}
