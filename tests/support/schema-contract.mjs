import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setOwnerContext } from "../../src/db/owner-context.mts";

// All fixtures stay inside a transaction rolled back by the caller. No real
// Auth identities, emails or financial records; never insert into neon_auth.
export async function schemaContract(client) {
  const a = `f0-05-synthetic-a-${randomUUID()}`;
  const b = `f0-05-synthetic-b-${randomUUID()}`;
  const eventA = randomUUID(),
    eventB = randomUUID(),
    categoryB = randomUUID();
  const commandHash = "a".repeat(64);
  let checks = 0;
  const expectError = async (sql, params, code) => {
    await client.query("SAVEPOINT negative_case");
    await assert.rejects(client.query(sql, params), { code });
    await client.query("ROLLBACK TO SAVEPOINT negative_case");
    await client.query("RELEASE SAVEPOINT negative_case");
    checks++;
  };
  const eventSql = `INSERT INTO finance.financial_events
    (owner_id,id,kind,concept,effective_on,idempotency_key,command_hash)
    VALUES ($1,$2,'expense','fixture F0-05','2026-01-31',$3,$4)`;
  const effectSql = `INSERT INTO finance.bank_effects
    (owner_id,id,event_id,currency,amount_signed,effective_on)
    VALUES ($1,$2,$3,$4,$5,'2026-01-31')`;

  for (const [owner, event] of [
    [a, eventA],
    [b, eventB],
  ]) {
    await setOwnerContext(client, owner);
    await client.query(
      "INSERT INTO finance.user_preferences(owner_id) VALUES ($1)",
      [owner],
    );
    await client.query(eventSql, [owner, event, randomUUID(), commandHash]);
    for (const [currency, amount] of [
      ["UYU", "0.1"],
      ["UYU", "0.2"],
      ["USD", "9007199254740993.0001"],
      ["EUR", "-9999999999999999.9999"],
    ])
      await client.query(effectSql, [
        owner,
        randomUUID(),
        event,
        currency,
        amount,
      ]);
    await client.query(
      "INSERT INTO finance.balance_checkpoints(owner_id,id,currency,confirmed_amount,as_of_date) VALUES ($1,$2,'UYU','30000','2026-03-01')",
      [owner, randomUUID()],
    );
    await client.query(
      "INSERT INTO finance.audit_changes(owner_id,id,event_id,change_type) VALUES ($1,$2,$3,'created')",
      [owner, randomUUID(), event],
    );
    await client.query(
      "INSERT INTO finance.categories(owner_id,id,kind,name) VALUES ($1,$2,'expense','fixture')",
      [owner, owner === b ? categoryB : randomUUID()],
    );
  }
  await setOwnerContext(client, a);
  const tables = [
    "user_preferences",
    "categories",
    "financial_events",
    "bank_effects",
    "balance_checkpoints",
    "audit_changes",
  ];
  for (const table of tables) {
    const all = await client.query(`SELECT owner_id FROM finance.${table}`);
    assert.ok(all.rows.length > 0);
    assert.ok(all.rows.every((row) => row.owner_id === a));
    assert.equal(
      (
        await client.query(
          `SELECT owner_id FROM finance.${table} WHERE owner_id=$1`,
          [b],
        )
      ).rowCount,
      0,
    );
    checks += 2;
  }
  assert.equal(
    (
      await client.query(
        "SELECT id FROM finance.financial_events WHERE id=$1",
        [eventB],
      )
    ).rowCount,
    0,
  );
  checks++;
  await expectError(
    eventSql,
    [b, randomUUID(), randomUUID(), commandHash],
    "42501",
  );
  await expectError(
    "UPDATE finance.financial_events SET concept='x' WHERE id=$1",
    [eventB],
    "42501",
  );
  for (const table of tables) {
    const privileges = await client.query(
      "SELECT has_table_privilege(current_user,$1,'DELETE') AS can_delete, has_table_privilege(current_user,$1,'TRUNCATE') AS can_truncate",
      [`finance.${table}`],
    );
    assert.deepEqual(privileges.rows[0], {
      can_delete: false,
      can_truncate: false,
    });
    checks++;
  }
  await expectError("CREATE TABLE finance.unapproved(id integer)", [], "42501");
  await expectError(
    "SELECT * FROM finance_meta.schema_migrations",
    [],
    "42501",
  );
  await expectError('SELECT id FROM neon_auth."user"', [], "42501");
  await expectError(effectSql, [a, randomUUID(), eventB, "UYU", "1"], "23503");
  await expectError(
    "INSERT INTO finance.categories(owner_id,id,parent_id,kind,name) VALUES ($1,$2,$3,'expense','cross-owner')",
    [a, randomUUID(), categoryB],
    "23503",
  );
  await expectError(
    "INSERT INTO finance.audit_changes(owner_id,id,event_id,change_type) VALUES ($1,$2,$3,'created')",
    [a, randomUUID(), eventB],
    "23503",
  );
  for (const table of ["balance_checkpoints", "audit_changes"])
    await expectError(`UPDATE finance.${table} SET owner_id=$1`, [b], "42501");
  const sums = (
    await client.query(
      "SELECT currency, SUM(amount_signed)::text AS total FROM finance.bank_effects GROUP BY currency ORDER BY currency",
    )
  ).rows;
  assert.deepEqual(sums, [
    { currency: "EUR", total: "-9999999999999999.9999" },
    { currency: "USD", total: "9007199254740993.0001" },
    { currency: "UYU", total: "0.3" },
  ]);
  checks++;
  for (const amount of [
    "0.00001",
    "10000000000000000",
    "-10000000000000000",
    "NaN",
    "Infinity",
    "-Infinity",
  ])
    await expectError(
      effectSql,
      [a, randomUUID(), eventA, "UYU", amount],
      "23514",
    );
  await expectError(effectSql, [a, randomUUID(), eventA, "GBP", "1"], "23514");
  await expectError(effectSql, [a, randomUUID(), eventA, "UYU", "0"], "23514");
  const request = randomUUID();
  await client.query(eventSql, [a, randomUUID(), request, commandHash]);
  await expectError(eventSql, [a, randomUUID(), request, commandHash], "23505");
  await setOwnerContext(client, b);
  await client.query(eventSql, [b, randomUUID(), request, commandHash]); // Key is private per owner.
  checks++;
  await setOwnerContext(client, a);
  const atomicId = randomUUID();
  await client.query("SAVEPOINT atomic_operation");
  await client.query(eventSql, [a, atomicId, randomUUID(), commandHash]);
  await assert.rejects(
    client.query(effectSql, [a, randomUUID(), atomicId, "UYU", "0.00001"]),
    { code: "23514" },
  );
  await client.query("ROLLBACK TO SAVEPOINT atomic_operation");
  assert.equal(
    (
      await client.query(
        "SELECT id FROM finance.financial_events WHERE id=$1",
        [atomicId],
      )
    ).rowCount,
    0,
  );
  checks++;
  await client.query("SELECT set_config('finance.owner_id', '', true)");
  for (const table of tables) {
    assert.equal(
      (await client.query(`SELECT owner_id FROM finance.${table}`)).rowCount,
      0,
    );
    checks++;
  }
  await expectError(
    eventSql,
    [a, randomUUID(), randomUUID(), commandHash],
    "42501",
  );
  return {
    checks,
    syntheticOnly: true,
    rlsRole: "finanzas_app",
    authSessionsTested: false,
  };
}
