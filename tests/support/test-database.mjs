import process from "node:process";

// This harness deliberately cannot connect to Neon or a production database.
export function testDatabaseConfig(env = process.env) {
  if (env.TEST_DATABASE_CONFIRM !== "isolated-local-test") {
    throw new Error(
      "Confirmar DB desechable con TEST_DATABASE_CONFIRM=isolated-local-test",
    );
  }
  if (
    env.TEST_DATABASE_URL !==
    "postgresql://f0_test:f0_test@127.0.0.1:55432/neondb"
  ) {
    throw new Error(
      "TEST_DATABASE_URL debe apuntar exclusivamente al servicio local de pruebas documentado",
    );
  }
  return {
    connectionString: env.TEST_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    statement_timeout: 10000,
    ssl: false,
  };
}
