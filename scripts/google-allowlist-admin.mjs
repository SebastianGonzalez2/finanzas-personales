// Caller owns the transaction and checks the development target. Serialize CLI
// changes for one email. Avoid INSERT ON CONFLICT: its BEFORE INSERT trigger
// writes an add audit event even when the operation only re-enables a row.
export async function setGoogleAllowed(client, email, enabled) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1,704049))",
    [email],
  );
  const {
    rows: [existing],
  } = await client.query(
    "SELECT enabled FROM app_access.allowlist WHERE email=$1 FOR UPDATE",
    [email],
  );
  if (!existing) {
    if (!enabled) return false;
    await client.query("INSERT INTO app_access.allowlist(email) VALUES($1)", [
      email,
    ]);
    return true;
  }
  if (existing.enabled === enabled) return false;
  await client.query(
    "UPDATE app_access.allowlist SET enabled=$2 WHERE email=$1",
    [email, enabled],
  );
  return true;
}
