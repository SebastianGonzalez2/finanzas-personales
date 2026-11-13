import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { withOwnerTransaction } from "../../src/db/owner-context.ts";
import { testDatabaseConfig } from "../support/test-database.mjs";
import prepareDatabase from "../support/f6-02-clean-database.mjs";
import {
  financeBrowserFixtures,
  runtimePassword,
} from "../support/finance-browser.mjs";

// F6-02 etapa A. Auditoría ejecutable de RLS, roles y funciones privilegiadas
// sobre el esquema versionado aplicado a la base desechable local. No toca Neon.
// Los fixtures son sintéticos (correos .invalid y UUID aleatorios).
const ownerExpression =
  "(owner_id = NULLIF(current_setting('finance.owner_id'::text, true), ''::text))";
// Tablas públicas o de metadatos sin columna owner_id. Una tabla nueva sin
// titular debe revisarse explícitamente (datos compartidos entre titulares).
const ownerlessTables = [
  "finance.fx_reference_rates",
  "finance.fx_reference_refreshes",
  "finance_meta.account_backup_layout",
  "finance_meta.schema_migrations",
];
// Privilegios de escritura del rol de runtime: cualquier cambio exige revisión.
const runtimeDeletable = [
  "card_currencies",
  "saved_history_filters",
  "statistics_favorites",
];
const runtimeUpdatable = {
  card_currencies: "credit_limit,debt",
  card_push_subscriptions: "auth,enabled,expires_at,p256dh",
  cards: "archived_at,issuer,name,version",
  categories: "archived_at",
  contribution_periods: "reserve_command_id,resolution,resolved_at,status",
  contribution_plans: "amount,next_amount,next_on,preferred_day,version",
  financial_events: "status",
  fx_reference_refreshes: "backup_pairs,primary_pairs,retry_at",
  merchants: "archived_at,merged_into,version",
  people: "archived_at,version",
  recurring_commands: "released_by",
  recurring_periods: "confirmed_total,finalized_amount,omitted,version",
  recurring_series: "paused,version",
  saved_history_filters: "criteria,name,normalized_name,version",
  savings_funds:
    "name,reserved_amount,status,target_amount,target_date,updated_at,version",
  tags: "archived_at,name,version",
  user_preferences: "display_currency,version",
};
const definers = [
  "app_access.allowlist_change",
  "app_access.authorize_session",
  "app_access.guard_account",
  "app_access.guard_session",
  "app_access.guard_user",
  "finance.account_backup_snapshot",
  "finance.account_backup_snapshot",
  "finance.cron_owner_is_active",
  "finance.delete_own_account",
  "finance.restore_account",
];

const local = (user) => ({
  host: "127.0.0.1",
  port: 55432,
  database: "neondb",
  user,
  password: runtimePassword,
  max: 2,
});

async function rejectsCode(promise, codes, message) {
  await assert.rejects(promise, (error) => {
    assert.ok(codes.includes(error.code), `${message}: ${error.code}`);
    return true;
  });
}

test("F6-02: RLS, privilegios y funciones privilegiadas del esquema completo", async (t) => {
  const clean = await prepareDatabase();
  const admin = new pg.Pool(testDatabaseConfig());
  const financeLogin = new pg.Pool(local("finanzas_google_finance"));
  const authLogin = new pg.Pool(local("finanzas_google_auth"));
  try {
    const { rows: relations } = await admin.query(`
      SELECT n.nspname AS schema, c.relname AS name, c.relrowsecurity AS rls,
             c.relforcerowsecurity AS forced,
             EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
               AND a.attname = 'owner_id' AND NOT a.attisdropped) AS owned
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('finance', 'finance_meta') AND c.relkind IN ('r', 'p')
       ORDER BY 1, 2`);
    assert.ok(relations.length >= 60, "Inventario completo de tablas");

    await t.test(
      "toda tabla con titular exige RLS forzada; las sin titular están enumeradas",
      () => {
        const ownerless = relations
          .filter((r) => !r.owned)
          .map((r) => `${r.schema}.${r.name}`);
        assert.deepEqual(ownerless, ownerlessTables);
        for (const r of relations.filter((r) => r.owned))
          assert.ok(
            r.rls && r.forced,
            `${r.schema}.${r.name} sin ENABLE+FORCE ROW LEVEL SECURITY`,
          );
      },
    );

    await t.test(
      "las políticas permisivas son únicamente el aislamiento por titular",
      async () => {
        const { rows } = await admin.query(`
        SELECT n.nspname || '.' || c.relname AS relation, p.polname, p.polpermissive,
               p.polcmd, pg_get_userbyid(c.relowner) AS owner,
               pg_get_expr(p.polqual, p.polrelid) AS qual,
               pg_get_expr(p.polwithcheck, p.polrelid) AS check,
               (SELECT array_agg(coalesce(r.rolname, 'PUBLIC')::text ORDER BY r.rolname)
                  FROM unnest(p.polroles) o LEFT JOIN pg_roles r ON r.oid = o) AS roles
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace`);
        assert.ok(rows.length >= 120);
        for (const row of rows.filter((r) => r.polpermissive)) {
          const deletionPolicy =
            row.relation === "finance.card_push_subscriptions" &&
            row.polname === "account_delete_owner";
          const label = `${row.relation}.${row.polname}`;
          assert.equal(row.polcmd, "*", label);
          if (deletionPolicy) assert.deepEqual(row.roles, [row.owner], label);
          assert.equal(row.qual, ownerExpression, label);
          // Esta política del migrador usa USING también como WITH CHECK.
          assert.equal(
            deletionPolicy ? (row.check ?? row.qual) : row.check,
            ownerExpression,
            label,
          );
          assert.ok(
            !row.roles.includes("PUBLIC"),
            `${row.relation}.${row.polname} aplica a PUBLIC`,
          );
          assert.ok(
            !row.roles.some((role) => /^finanzas_google_/.test(role)),
            `${row.relation}.${row.polname} aplica a un rol de login`,
          );
        }
        // Cada tabla legible por el runtime tiene su política permisiva propia.
        const { rows: readable } = await admin.query(`
        SELECT n.nspname || '.' || c.relname AS relation FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p')
           AND has_table_privilege('finanzas_app', c.oid, 'SELECT')
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
             AND a.attname = 'owner_id' AND NOT a.attisdropped)`);
        for (const { relation } of readable)
          assert.ok(
            rows.some(
              (p) =>
                p.relation === relation &&
                p.polpermissive &&
                p.roles.includes("finanzas_app"),
            ),
            `${relation} sin política permisiva para finanzas_app`,
          );
      },
    );

    await t.test(
      "las vistas de runtime heredan RLS (security_invoker) y no son del rol de runtime",
      async () => {
        const { rows } = await admin.query(`
        SELECT c.relname, c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname IN ('finance', 'finance_meta') AND c.relkind IN ('v', 'm')`);
        assert.ok(rows.length >= 19);
        for (const view of rows)
          assert.ok(
            view.reloptions?.includes("security_invoker=true"),
            `finance.${view.relname} omite RLS del invocador`,
          );
      },
    );

    await t.test(
      "privilegios del runtime: sin PUBLIC, sin DDL, escrituras y borrados fijados",
      async () => {
        const { rows: publicGrants } = await admin.query(`
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
               LATERAL aclexplode(c.relacl) a
         WHERE n.nspname IN ('finance', 'finance_meta', 'app_auth', 'app_access', 'app_auth_meta')
           AND a.grantee = 0`);
        assert.deepEqual(
          publicGrants,
          [],
          "PUBLIC no recibe privilegios de tabla",
        );
        const { rows: tablePrivileges } = await admin.query(`
        SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
         WHERE grantee = 'finanzas_app'`);
        assert.deepEqual(
          tablePrivileges.map((r) => r.privilege_type).sort(),
          ["DELETE", "INSERT", "SELECT"],
          "Sin TRUNCATE, REFERENCES, TRIGGER ni UPDATE de tabla completa",
        );
        const { rows: deletable } = await admin.query(`
        SELECT table_name FROM information_schema.role_table_grants
         WHERE grantee = 'finanzas_app' AND privilege_type = 'DELETE' ORDER BY 1`);
        assert.deepEqual(
          deletable.map((r) => r.table_name),
          runtimeDeletable,
        );
        const { rows: updatable } = await admin.query(`
        SELECT table_name, string_agg(column_name, ',' ORDER BY column_name) AS columns
          FROM information_schema.column_privileges
         WHERE grantee = 'finanzas_app' AND privilege_type = 'UPDATE'
           AND table_schema = 'finance'
           AND table_name IN (SELECT relname FROM pg_class WHERE relkind IN ('r', 'p'))
         GROUP BY 1 ORDER BY 1`);
        assert.deepEqual(
          Object.fromEntries(updatable.map((r) => [r.table_name, r.columns])),
          runtimeUpdatable,
          "Ninguna columna de titular o importe histórico es actualizable",
        );
        for (const columns of Object.values(runtimeUpdatable))
          assert.doesNotMatch(columns, /(^|,)owner_id(,|$)/);
        const { rows: usage } = await admin.query(`
        SELECT nspname,
               has_schema_privilege('finanzas_app', nspname, 'USAGE') AS usage,
               has_schema_privilege('finanzas_app', nspname, 'CREATE') AS create,
               has_schema_privilege('finanzas_google_finance', nspname, 'USAGE') AS login_usage
          FROM pg_namespace
         WHERE nspname IN ('finance', 'finance_meta', 'app_auth', 'app_access', 'app_auth_meta', 'neon_auth', 'public')`);
        for (const row of usage) {
          assert.equal(row.create, false, `${row.nspname}: CREATE`);
          assert.equal(
            row.usage,
            ["finance", "app_access", "public"].includes(row.nspname),
            `${row.nspname}: USAGE`,
          );
        }
        assert.equal(
          usage.find((row) => row.nspname === "finance_meta").usage,
          false,
          "El runtime no lee metadatos ni recibos de restauración",
        );
      },
    );

    await t.test(
      "roles de aplicación: sin privilegios elevados, sin propiedad y sin escalada",
      async () => {
        const { rows: roles } = await admin.query(`
        SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
               rolreplication, rolcanlogin, rolinherit
          FROM pg_roles WHERE rolname LIKE 'finanzas%' ORDER BY 1`);
        assert.deepEqual(
          roles.map((r) => [r.rolname, r.rolcanlogin]),
          [
            ["finanzas_app", false],
            ["finanzas_google_auth", true],
            ["finanzas_google_finance", true],
          ],
        );
        for (const role of roles) {
          assert.equal(role.rolsuper, false, role.rolname);
          assert.equal(role.rolbypassrls, false, role.rolname);
          assert.equal(role.rolcreatedb, false, role.rolname);
          assert.equal(role.rolcreaterole, false, role.rolname);
          assert.equal(role.rolreplication, false, role.rolname);
          assert.equal(role.rolinherit, false, role.rolname);
        }
        const { rows: members } = await admin.query(`
        SELECT pg_get_userbyid(member) AS member, pg_get_userbyid(roleid) AS role
          FROM pg_auth_members
         WHERE (pg_get_userbyid(member) LIKE 'finanzas%' OR pg_get_userbyid(roleid) LIKE 'finanzas%')
           AND member <> (SELECT oid FROM pg_roles WHERE rolname = current_user)`);
        assert.deepEqual(members, [
          { member: "finanzas_google_finance", role: "finanzas_app" },
        ]);
        const { rows: owned } = await admin.query(`
        SELECT count(*)::int AS count FROM pg_class c
         WHERE pg_get_userbyid(c.relowner) LIKE 'finanzas%'`);
        assert.equal(
          owned[0].count,
          0,
          "Los roles de runtime no son propietarios",
        );
      },
    );

    await t.test(
      "funciones SECURITY DEFINER: inventario fijo, search_path acotado y sin PUBLIC",
      async () => {
        const { rows } = await admin.query(`
        SELECT n.nspname || '.' || p.proname AS name, p.proconfig,
               has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname IN ('finance', 'finance_meta', 'app_auth', 'app_access')
           AND p.prosecdef ORDER BY 1`);
        assert.deepEqual(
          rows.map((r) => r.name),
          definers,
        );
        for (const row of rows) {
          assert.equal(row.public_exec, false, row.name);
          const path = row.proconfig?.find((c) => c.startsWith("search_path="));
          assert.ok(path, `${row.name} sin search_path fijo`);
          assert.doesNotMatch(path, /\bpublic\b/, `${row.name}: search_path`);
        }
        const { rows: executable } = await admin.query(`
        SELECT n.nspname || '.' || p.proname AS name FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname IN ('finance', 'app_access', 'finance_meta') AND p.prosecdef
           AND has_function_privilege('finanzas_app', p.oid, 'EXECUTE') ORDER BY 1`);
        assert.deepEqual(
          executable.map((r) => r.name),
          [
            "app_access.authorize_session",
            "finance.account_backup_snapshot",
            "finance.cron_owner_is_active",
            "finance.delete_own_account",
            "finance.restore_account",
          ],
        );
      },
    );

    await t.test(
      "los roles de login no leen datos financieros ni de sesión sin el contexto del titular",
      async () => {
        for (const sql of [
          "SELECT * FROM finance.financial_events",
          "SELECT * FROM app_auth.session",
          "SELECT * FROM app_access.allowlist",
          "SELECT app_access.authorize_session('token')",
          "SELECT * FROM finance.account_backup_snapshot('invalid')",
          "SET ROLE finanzas_google_auth",
        ])
          await rejectsCode(
            financeLogin.query(sql),
            ["42501"],
            `finance: ${sql}`,
          );
        for (const sql of [
          "SELECT * FROM finance.financial_events",
          "SELECT app_access.authorize_session('token')",
          "UPDATE app_access.allowlist SET enabled = true",
          "INSERT INTO app_access.allowlist(email) VALUES ('outside@example.invalid')",
          "SELECT * FROM finance_meta.account_restores",
          "SET ROLE finanzas_app",
          "CREATE TABLE public.f6_02_probe(id int)",
        ])
          await rejectsCode(authLogin.query(sql), ["42501"], `auth: ${sql}`);
      },
    );

    await t.test(
      "la sesión del runtime financiero no puede leer sesiones, allowlist ni crear objetos",
      async () => {
        const client = await financeLogin.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL ROLE finanzas_app");
          for (const sql of [
            "SELECT * FROM app_auth.session",
            'SELECT * FROM app_auth."user"',
            "SELECT * FROM app_access.allowlist",
            "SELECT * FROM finance_meta.account_restores",
            "SELECT * FROM finance_meta.schema_migrations",
            "SELECT finance.account_backup_layout()",
            "CREATE TABLE finance.f6_02_probe(id int)",
            "CREATE TABLE public.f6_02_probe(id int)",
            "CREATE FUNCTION finance.f6_02_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'",
            "TRUNCATE finance.financial_events",
            "DROP TABLE finance.financial_events",
            "ALTER TABLE finance.financial_events DISABLE ROW LEVEL SECURITY",
            "SET ROLE finanzas_google_auth",
            "SET ROLE f0_test",
          ]) {
            await client.query("SAVEPOINT probe");
            await rejectsCode(
              client.query(sql),
              ["42501", "42P01", "42883"],
              sql,
            );
            await client.query("ROLLBACK TO SAVEPOINT probe");
          }
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      },
    );
  } finally {
    await Promise.all([admin.end(), financeLogin.end(), authLogin.end()]);
    await clean();
  }
});

test("F6-02: titulares A/B, sesión inválida y contexto manipulado sobre todas las tablas", async (t) => {
  const clean = await prepareDatabase();
  const admin = new pg.Pool(testDatabaseConfig());
  try {
    const { owners } = await financeBrowserFixtures();
    const tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(owners).map(async ([key, id]) => [
          key,
          (
            await admin.query(
              'SELECT token FROM app_auth.session WHERE "userId" = $1 ORDER BY "createdAt" LIMIT 1',
              [id],
            )
          ).rows[0].token,
        ]),
      ),
    );
    const tx = (ownerId, work) =>
      withOwnerTransaction(admin, async () => ({ ownerId }), work);
    const eventSql = `INSERT INTO finance.financial_events
      (owner_id,id,kind,concept,effective_on,idempotency_key,command_hash)
      VALUES ($1,$2,'expense','fixture F6-02','2026-01-31',$3,$4)`;
    const seeded = {};
    for (const [key, owner] of Object.entries(owners)) {
      const ids = {
        event: randomUUID(),
        effect: randomUUID(),
        category: randomUUID(),
        checkpoint: randomUUID(),
      };
      seeded[key] = ids;
      await tx(owner, async (client) => {
        await client.query(
          "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
          [owner],
        );
        await client.query(eventSql, [
          owner,
          ids.event,
          randomUUID(),
          "a".repeat(64),
        ]);
        await client.query(
          `INSERT INTO finance.bank_effects(owner_id,id,event_id,currency,amount_signed,effective_on)
           VALUES ($1,$2,$3,'UYU','-10.5','2026-01-31')`,
          [owner, ids.effect, ids.event],
        );
        await client.query(
          "INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date) VALUES ($1,$2,'UYU','100','2026-01-01')",
          [owner, ids.checkpoint],
        );
        await client.query(
          "INSERT INTO finance.audit_changes(owner_id,id,event_id,change_type) VALUES ($1,$2,$3,'created')",
          [owner, randomUUID(), ids.event],
        );
        await client.query(
          "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','sintética')",
          [owner, ids.category],
        );
      });
    }
    const { rows: ownerTables } = await admin.query(`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'finance' AND c.relkind IN ('r', 'p')
         AND has_table_privilege('finanzas_app', c.oid, 'SELECT')
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid
           AND a.attname = 'owner_id' AND NOT a.attisdropped)
       ORDER BY 1`);
    const digest = async (owner) =>
      Object.fromEntries(
        await Promise.all(
          ownerTables.map(async ({ relname }) => [
            relname,
            (
              await admin.query(
                `SELECT count(*)::int AS rows,
                        coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS digest
                   FROM finance.${relname} t WHERE owner_id = $1`,
                [owner],
              )
            ).rows[0],
          ]),
        ),
      );
    const before = { a: await digest(owners.a), b: await digest(owners.b) };
    assert.ok(
      before.a.financial_events.rows === 1 && before.b.bank_effects.rows === 1,
    );

    await t.test(
      "B no ve filas ajenas en ninguna tabla con titular y su vista coincide con sus propias filas",
      async () => {
        await tx(owners.b, async (client) => {
          for (const { relname } of ownerTables) {
            const { rows } = await client.query(
              `SELECT count(*)::int AS visible,
                    count(*) FILTER (WHERE owner_id <> current_setting('finance.owner_id'))::int AS foreign
               FROM finance.${relname}`,
            );
            assert.equal(
              rows[0].foreign,
              0,
              `${relname}: filas ajenas visibles`,
            );
            assert.equal(rows[0].visible, before.b[relname].rows, relname);
          }
          for (const [table, id] of [
            ["financial_events", seeded.a.event],
            ["bank_effects", seeded.a.effect],
            ["categories", seeded.a.category],
            ["balance_checkpoints", seeded.a.checkpoint],
          ])
            assert.equal(
              (
                await client.query(
                  `SELECT 1 FROM finance.${table} WHERE id = $1`,
                  [id],
                )
              ).rowCount,
              0,
              `${table}: la referencia directa de A es inexistente para B`,
            );
        });
      },
    );

    await t.test(
      "B no puede modificar, borrar, reasignar ni crear filas de A",
      async () => {
        const attempts = [
          [
            "UPDATE finance.financial_events SET status = 'voided' WHERE id = $1",
            [seeded.a.event],
          ],
          [
            "UPDATE finance.categories SET archived_at = now() WHERE id = $1",
            [seeded.a.category],
          ],
          [
            "UPDATE finance.financial_events SET owner_id = $2 WHERE id = $1",
            [seeded.a.event, owners.b],
          ],
          [
            "UPDATE finance.categories SET owner_id = $2 WHERE id = $1",
            [seeded.a.category, owners.b],
          ],
          [
            "DELETE FROM finance.saved_history_filters WHERE owner_id = $1",
            [owners.a],
          ],
          [
            "DELETE FROM finance.card_currencies WHERE owner_id = $1",
            [owners.a],
          ],
          [
            "DELETE FROM finance.statistics_favorites WHERE owner_id = $1",
            [owners.a],
          ],
          [
            "DELETE FROM finance.financial_events WHERE id = $1",
            [seeded.a.event],
          ],
          ["DELETE FROM finance.bank_effects WHERE id = $1", [seeded.a.effect]],
          ["TRUNCATE finance.financial_events", []],
        ];
        await tx(owners.b, async (client) => {
          for (const [sql, params] of attempts) {
            await client.query("SAVEPOINT attempt");
            try {
              const result = await client.query(sql, params);
              assert.equal(result.rowCount, 0, `${sql}: afectó filas de A`);
            } catch (error) {
              assert.ok(
                ["42501", "23503"].includes(error.code),
                `${sql}: ${error.code}`,
              );
            }
            await client.query("ROLLBACK TO SAVEPOINT attempt");
          }
          for (const [sql, params, code] of [
            [
              eventSql,
              [owners.a, randomUUID(), randomUUID(), "b".repeat(64)],
              "42501",
            ],
            [
              "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','intruso')",
              [owners.a, randomUUID()],
              "42501",
            ],
            [
              "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
              [owners.a],
              "42501",
            ],
            [
              "INSERT INTO finance.bank_effects(owner_id,id,event_id,currency,amount_signed,effective_on) VALUES ($1,$2,$3,'UYU','1','2026-01-31')",
              [owners.b, randomUUID(), seeded.a.event],
              "23503",
            ],
            [
              "INSERT INTO finance.categories(owner_id,id,parent_id,kind,name) VALUES ($1,$2,$3,'expense','hija ajena')",
              [owners.b, randomUUID(), seeded.a.category],
              "23503",
            ],
          ]) {
            await client.query("SAVEPOINT attempt");
            await rejectsCode(client.query(sql, params), [code], sql);
            await client.query("ROLLBACK TO SAVEPOINT attempt");
          }
        });
        assert.deepEqual(
          await digest(owners.a),
          before.a,
          "Los datos de A quedaron intactos",
        );
        assert.deepEqual(
          await digest(owners.b),
          before.b,
          "Los de B no recibieron filas de A",
        );
      },
    );

    await t.test(
      "sin contexto de titular o con contexto vacío, ninguna tabla devuelve filas",
      async () => {
        for (const reset of [
          "SELECT set_config('finance.owner_id', '', true)",
          "SELECT set_config('finance.owner_id', '   ', true)",
          "RESET finance.owner_id",
        ]) {
          const client = await admin.connect();
          try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE finanzas_app");
            await client.query(reset);
            for (const { relname } of ownerTables)
              assert.equal(
                (await client.query(`SELECT 1 FROM finance.${relname}`))
                  .rowCount,
                0,
                `${relname}: ${reset}`,
              );
            await client.query("SAVEPOINT attempt");
            await rejectsCode(
              client.query(eventSql, [
                owners.a,
                randomUUID(),
                randomUUID(),
                "c".repeat(64),
              ]),
              ["42501"],
              "escritura sin contexto",
            );
            await client.query("ROLLBACK TO SAVEPOINT attempt");
            await client.query("ROLLBACK");
          } finally {
            client.release();
          }
        }
      },
    );

    await t.test(
      "authorize_session rechaza tokens inexistentes, manipulados, expirados y revocados",
      async () => {
        const authorize = (token, owner = owners.a) =>
          tx(
            owner,
            async (client) =>
              (
                await client.query(
                  "SELECT app_access.authorize_session($1) AS owner",
                  [token],
                )
              ).rows[0].owner,
          );
        assert.equal(await authorize(tokens.a), owners.a);
        assert.equal(await authorize(tokens.b, owners.b), owners.b);
        // Un token válido no cambia de titular al presentarlo desde otro contexto.
        assert.equal(await authorize(tokens.b, owners.a), owners.b);
        for (const bad of [
          "",
          " ",
          randomUUID(),
          `${tokens.a} `,
          ` ${tokens.a}`,
          tokens.a.toUpperCase() === tokens.a
            ? tokens.a.toLowerCase()
            : tokens.a.toUpperCase(),
          tokens.a.slice(0, -1),
          `${tokens.a}\u0000`.replace("\u0000", ""),
          "' OR '1'='1",
        ]) {
          if (bad === tokens.a) continue;
          assert.equal(await authorize(bad), null, `token «${bad}»`);
        }
        await admin.query(
          `UPDATE app_auth.session SET "expiresAt" = now() - interval '1 second' WHERE token = $1`,
          [tokens.a],
        );
        assert.equal(await authorize(tokens.a), null, "sesión expirada");
        await admin.query(
          `UPDATE app_auth.session SET "expiresAt" = now() + interval '1 hour' WHERE token = $1`,
          [tokens.a],
        );
        assert.equal(await authorize(tokens.a), owners.a, "sesión vigente");
        await admin.query(
          "UPDATE app_access.allowlist SET enabled = false WHERE user_id = $1",
          [owners.a],
        );
        assert.equal(await authorize(tokens.a), null, "titular revocado");
        assert.equal(
          (
            await admin.query(
              'SELECT 1 FROM app_auth.session WHERE "userId" = $1',
              [owners.a],
            )
          ).rowCount,
          0,
          "La revocación elimina todas las sesiones del titular",
        );
        assert.equal(
          await authorize(tokens.b, owners.b),
          owners.b,
          "B no se ve afectado",
        );
        await admin.query(
          "UPDATE app_access.allowlist SET enabled = true WHERE user_id = $1",
          [owners.a],
        );
        assert.equal(
          await authorize(tokens.a),
          null,
          "Rehabilitar no restaura sesiones previas",
        );
      },
    );

    await t.test(
      "restore_account no acepta un titular de la solicitud ni un contexto manipulado",
      async () => {
        const restore = (contextOwner, token) =>
          tx(contextOwner, async (client) => {
            await client.query("SAVEPOINT attempt");
            try {
              const { rows } = await client.query(
                "SELECT finance.restore_account($1, '{}'::jsonb, 'x', $2, $3) AS status",
                [
                  token,
                  randomUUID(),
                  createHash("sha256").update("{}").digest("hex"),
                ],
              );
              return rows[0].status;
            } catch (error) {
              await client.query("ROLLBACK TO SAVEPOINT attempt");
              return error.code;
            }
          });
        // Contexto B con el token de A, contexto A con el token de B y token inexistente.
        assert.equal(await restore(owners.b, tokens.a), "42501");
        assert.equal(await restore(owners.a, tokens.b), "42501");
        assert.equal(await restore(owners.b, randomUUID()), "42501");
        assert.equal(await restore(owners.b, ""), "42501");
        assert.deepEqual(await digest(owners.b), before.b);
      },
    );

    await t.test(
      "F6-02-H03: la copia exige una sesión vigente del mismo titular",
      async () => {
        const snapshot = (owner, token) =>
          tx(owner, async (client) => {
            await client.query("SAVEPOINT attempt");
            try {
              const { rows } = await client.query(
                "SELECT payload FROM finance.account_backup_snapshot($1)",
                [token],
              );
              return rows[0].payload;
            } catch (error) {
              await client.query("ROLLBACK TO SAVEPOINT attempt");
              return error.code;
            }
          });
        const own = await snapshot(owners.b, tokens.b);
        assert.match(own, new RegExp(seeded.b.event));
        assert.doesNotMatch(own, new RegExp(seeded.a.event));
        assert.equal(await snapshot(owners.a, tokens.b), "42501");
        assert.equal(await snapshot(owners.b, randomUUID()), "42501");
        assert.equal(await snapshot(owners.b, null), "42501");
        assert.equal(
          await snapshot(owners.a, tokens.a),
          "42501",
          "Sesión revocada",
        );
        await admin.query(
          `UPDATE app_auth.session SET "expiresAt"=now()-interval '1 minute' WHERE token=$1`,
          [tokens.b],
        );
        assert.equal(
          await snapshot(owners.b, tokens.b),
          "42501",
          "Sesión expirada",
        );
        await tx(owners.b, async (client) => {
          await client.query("SAVEPOINT attempt");
          await rejectsCode(
            client.query("SELECT * FROM finance.account_backup_snapshot()"),
            ["42501"],
            "El snapshot interno no es ejecutable por runtime",
          );
          await client.query("ROLLBACK TO SAVEPOINT attempt");
        });
      },
    );

    await t.test(
      "F6-02-H04: el importador puede insertar referencias globales, las observaciones son inmutables",
      async () => {
        await tx(owners.b, async (client) => {
          await client.query("SAVEPOINT fx_probe");
          const { rowCount } = await client.query(
            `INSERT INTO finance.fx_reference_rates(base_currency, quote_currency, observed_on, source, rate)
             VALUES ('USD', 'UYU', '2001-01-01', 'frankfurter', '999999')`,
          );
          assert.equal(
            rowCount,
            1,
            "Evidencia del permiso compartido de escritura",
          );
          await rejectsCode(
            client.query("UPDATE finance.fx_reference_rates SET rate=1"),
            ["42501"],
            "Runtime sin UPDATE de observaciones",
          );
          await client.query("ROLLBACK TO SAVEPOINT fx_probe");
        });
      },
    );
  } finally {
    await admin.end();
    await clean();
  }
});
