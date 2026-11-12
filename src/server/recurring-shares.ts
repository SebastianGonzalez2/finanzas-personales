import "server-only";
import type pg from "pg";
import { normalizeName } from "../domain/catalog.ts";
import type { Person, ShareInput } from "../domain/recurring-shares.ts";

export async function recurringSharesReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    "SELECT to_regclass('finance.recurring_share_participants') IS NOT NULL AS ready",
  );
  return rows[0].ready;
}

export async function listPeople(client: pg.PoolClient, ownerId: string) {
  const { rows } = await client.query<Person>(
    `SELECT id, name FROM finance.people
     WHERE owner_id = $1 AND archived_at IS NULL ORDER BY normalized_name, id`,
    [ownerId],
  );
  return rows;
}

export async function resolveUsualShares(
  client: pg.PoolClient,
  ownerId: string,
  shares: ShareInput[],
) {
  const { rows } = await client.query<{
    id: string;
    normalized_name: string;
    archived: boolean;
  }>(
    `SELECT id, normalized_name, archived_at IS NOT NULL AS archived
       FROM finance.people
      WHERE owner_id = $1 AND (id = ANY($2::uuid[]) OR normalized_name = ANY($3::text[]))`,
    [
      ownerId,
      shares.flatMap((share) => ("personId" in share ? [share.personId] : [])),
      shares.flatMap((share) =>
        "name" in share ? [normalizeName(share.name)] : [],
      ),
    ],
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byName = new Map(rows.map((row) => [row.normalized_name, row]));
  const resolved = [];
  const seen = new Set<string>();
  for (const share of shares) {
    const name = "name" in share ? share.name : null;
    const selected =
      "personId" in share
        ? byId.get(share.personId)
        : byName.get(normalizeName(share.name));
    if (selected?.archived || (!selected && name === null)) return null;
    const normalized =
      selected?.normalized_name ?? normalizeName(name!);
    if (seen.has(normalized)) return null;
    seen.add(normalized);
    resolved.push({
      id: selected?.id ?? null,
      name,
      normalized,
      percentage: share.percentage,
    });
  }
  return resolved;
}

export async function saveUsualShares(
  client: pg.PoolClient,
  ownerId: string,
  seriesId: string,
  shares: NonNullable<Awaited<ReturnType<typeof resolveUsualShares>>>,
) {
  await client.query(
    `WITH shares AS (
       SELECT * FROM jsonb_to_recordset($3::jsonb)
         AS s(id uuid, name text, normalized text, percentage numeric)
     ), added AS (
       INSERT INTO finance.people (owner_id, name, normalized_name)
         SELECT $1, name, normalized FROM shares WHERE id IS NULL
         RETURNING id, normalized_name
     )
     INSERT INTO finance.recurring_share_participants (owner_id, series_id, person_id, percentage)
       SELECT $1, $2, coalesce(s.id, a.id), s.percentage
       FROM shares s LEFT JOIN added a ON a.normalized_name = s.normalized`,
    [ownerId, seriesId, JSON.stringify(shares)],
  );
}
