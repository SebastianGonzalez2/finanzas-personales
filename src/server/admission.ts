import "server-only";
import process from "node:process";
import { admissionTransaction } from "./auth-database.ts";
import {
  digest,
  privateDigest,
  matchesHash,
  newGrant,
  normalizeEmail,
} from "./auth-policy.ts";

export function emailDigest(email: string) {
  return privateDigest(
    process.env.NEON_ADMISSION_SECRET ?? "",
    "email",
    normalizeEmail(email),
  );
}
export async function issueAdmission(
  input: {
    email: unknown;
    provider: unknown;
    code: unknown;
  },
  transaction = admissionTransaction,
) {
  const email = normalizeEmail(input.email);
  if (
    !["credential", "google"].includes(String(input.provider)) ||
    typeof input.code !== "string" ||
    input.code.length > 256
  )
    throw new Error("Entrada inválida");
  const emailHash = emailDigest(email);
  const codeHash = privateDigest(
    process.env.NEON_ADMISSION_SECRET ?? "",
    "code",
    input.code,
  );
  return transaction(async (client) => {
    // Attempts, including failures, commit. Global cap cannot be bypassed by forged IPs.
    const counts: number[] = [];
    for (const [scope, subject] of [
      ["global", "all"],
      ["email", emailHash],
    ]) {
      const result = await client.query(
        `INSERT INTO admission.attempt_buckets(scope,subject_hash,window_at,attempts)
        VALUES ($1,$2,clock_timestamp(),1) ON CONFLICT(scope,subject_hash) DO UPDATE SET
        attempts=CASE WHEN admission.attempt_buckets.window_at < clock_timestamp()-interval '15 minutes' THEN 1 ELSE admission.attempt_buckets.attempts+1 END,
        window_at=CASE WHEN admission.attempt_buckets.window_at < clock_timestamp()-interval '15 minutes' THEN clock_timestamp() ELSE admission.attempt_buckets.window_at END
        RETURNING attempts`,
        [scope, subject],
      );
      counts.push(result.rows[0].attempts);
    }
    if (counts[0] > 100 || counts[1] > 5) return null;
    const {
      rows: [policy],
    } = await client.query(
      "SELECT generation,code_hash FROM admission.policy WHERE singleton",
    );
    if (!policy || !matchesHash(codeHash, policy.code_hash)) return null;
    const token = newGrant();
    await client.query(
      `INSERT INTO admission.grants(token_hash,email_hash,provider,generation,expires_at)
      VALUES ($1,$2,$3,$4,clock_timestamp()+interval '5 minutes')`,
      [digest(token), emailHash, input.provider, policy.generation],
    );
    return token;
  });
}
export type BeforeCreate = {
  event_id: string;
  user: { id: string; email: string };
  event_data: {
    auth_provider: string;
    signup_metadata?: { admissionId?: string };
  };
};
// Caller MUST cryptographically verify the raw request before invoking this function.
export async function decideAdmission(
  event: BeforeCreate,
  rawBody: string,
  transaction = admissionTransaction,
) {
  const owner = event.user?.id;
  const token = event.event_data?.signup_metadata?.admissionId;
  const provider = event.event_data?.auth_provider;
  if (
    typeof owner !== "string" ||
    !owner ||
    owner.length > 200 ||
    typeof event.event_id !== "string" ||
    !event.event_id ||
    event.event_id.length > 200 ||
    typeof token !== "string" ||
    !/^[\w-]{43}$/.test(token) ||
    !["credential", "google"].includes(provider)
  )
    return false;
  const emailHash = emailDigest(event.user.email);
  const fingerprint = digest(rawBody);
  return transaction(async (client) => {
    const {
      rows: [policy],
    } = await client.query(
      "SELECT generation,code_hash FROM admission.policy WHERE singleton",
    );
    if (!policy?.code_hash) return false;
    const {
      rows: [prior],
    } = await client.query(
      `SELECT *, expires_at > clock_timestamp() AS fresh FROM admission.decisions WHERE event_id=$1`,
      [event.event_id],
    );
    if (prior)
      return (
        prior.allowed &&
        prior.fingerprint === fingerprint &&
        prior.generation === policy.generation &&
        prior.fresh
      );
    const consumed = await client.query(
      `UPDATE admission.grants SET consumed_event=$1
      WHERE token_hash=$2 AND email_hash=$3 AND provider=$4 AND generation=$5
        AND consumed_event IS NULL AND expires_at > clock_timestamp() RETURNING expires_at`,
      [event.event_id, digest(token), emailHash, provider, policy.generation],
    );
    const allowed = consumed.rowCount === 1;
    await client.query(
      `INSERT INTO admission.decisions(event_id,fingerprint,allowed,generation,expires_at)
      VALUES ($1,$2,$3,$4,COALESCE($5,clock_timestamp()+interval '5 minutes'))`,
      [
        event.event_id,
        fingerprint,
        allowed,
        policy.generation,
        consumed.rows[0]?.expires_at ?? null,
      ],
    );
    if (allowed)
      await client.query(
        `INSERT INTO admission.owners(owner_id,email_hash,provider,event_id)
      VALUES ($1,$2,$3,$4)`,
        [owner, emailHash, provider, event.event_id],
      );
    return allowed;
  });
}
