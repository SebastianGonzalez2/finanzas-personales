import "server-only";
import { ECDH, createECDH } from "node:crypto";
import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";
import type pg from "pg";
import { cardCyclesReady, listCardCycleAlerts } from "./card-cycles.ts";
import { cardsReady, listCards } from "./cards.ts";

export async function cardPushReady(client: pg.PoolClient) {
  const { rows } = await client.query<{ ready: boolean }>(
    `SELECT to_regclass('finance.card_push_subscriptions') IS NOT NULL
         AND to_regclass('finance.card_push_attempts') IS NOT NULL AS ready`,
  );
  return rows[0].ready;
}

function validKey(value: unknown, length: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.length === length && bytes.toString("base64url") === value;
}

function validPublicKey(value: unknown): value is string {
  if (!validKey(value, 65) || !value.startsWith("B")) return false;
  try {
    ECDH.convertKey(value, "prime256v1", "base64url");
    return true;
  } catch {
    return false;
  }
}

export function cardPushConfig(): VapidKeys | null {
  const {
    CARD_PUSH_VAPID_SUBJECT: subject,
    CARD_PUSH_PUBLIC_KEY: publicKey,
    CARD_PUSH_PRIVATE_KEY: privateKey,
    CRON_SECRET: cronSecret,
  } = process.env;
  if (
    !subject ||
    !/^mailto:[^\s@]+@[^\s@]+$/.test(subject) ||
    !validPublicKey(publicKey) ||
    !validKey(privateKey, 32) ||
    !cronSecret ||
    cronSecret.length < 16
  )
    return null;
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(privateKey, "base64url");
    if (key.getPublicKey("base64url") !== publicKey) return null;
    return { subject, publicKey, privateKey };
  } catch {
    return null;
  }
}

// Only browser push providers. The sender also refuses redirects.
export function isCardPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      ((!url.search &&
        url.hostname === "fcm.googleapis.com" &&
        /^\/fcm\/send\/[\w:-]+$/.test(url.pathname)) ||
        (!url.search &&
          url.hostname === "updates.push.services.mozilla.com" &&
          /^\/wpush\/v2\/[\w-]+$/.test(url.pathname)) ||
        (!url.search &&
          /^(?:[a-z0-9-]+\.)+push\.apple\.com$/.test(url.hostname) &&
          /^\/Q[\w-]+$/.test(url.pathname)) ||
        (/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname) &&
          url.pathname === "/w/" &&
          /^\?token=[\w.%+-]+$/.test(url.search)))
    );
  } catch {
    return false;
  }
}

export function parseCardPushSubscription(
  value: unknown,
): PushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, expirationTime, keys } = value as Partial<PushSubscription>;
  if (
    !isCardPushEndpoint(endpoint) ||
    (expirationTime != null &&
      (!Number.isSafeInteger(expirationTime) ||
        expirationTime <= Date.now() ||
        expirationTime > Date.UTC(9999, 0, 1))) ||
    !validPublicKey(keys?.p256dh) ||
    !validKey(keys?.auth, 16)
  )
    return null;
  return { endpoint, expirationTime: expirationTime ?? null, keys };
}

export async function enableCardPush(
  client: pg.PoolClient,
  ownerId: string,
  subscription: PushSubscription,
) {
  // Update only this owner's row. Another owner's endpoint is never reassigned.
  const values = [
    ownerId,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    subscription.expirationTime === null
      ? null
      : new Date(subscription.expirationTime),
  ];
  const { rowCount } = await client.query(
    `INSERT INTO finance.card_push_subscriptions(owner_id, endpoint, p256dh, auth, expires_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO NOTHING`,
    values,
  );
  if (rowCount) return true;
  const updated = await client.query(
    `UPDATE finance.card_push_subscriptions
        SET enabled = true, p256dh = $3, auth = $4, expires_at = $5
      WHERE (owner_id, endpoint) = ($1, $2)`,
    values,
  );
  return updated.rowCount === 1;
}

export async function disableCardPush(
  client: pg.PoolClient,
  ownerId: string,
  endpoint: string,
) {
  await client.query(
    `UPDATE finance.card_push_subscriptions SET enabled = false
      WHERE (owner_id, endpoint) = ($1, $2)`,
    [ownerId, endpoint],
  );
}

export async function cardPushEnabled(
  client: pg.PoolClient,
  ownerId: string,
  endpoint: string,
) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM finance.card_push_subscriptions
      WHERE (owner_id, endpoint) = ($1, $2) AND enabled
        AND (expires_at IS NULL OR expires_at > now())`,
    [ownerId, endpoint],
  );
  return rowCount === 1;
}

type Alert = Awaited<ReturnType<typeof listCardCycleAlerts>>[number];
type Cycle = Pick<Alert, "cardId" | "period" | "currency">;
type PushClaim = { subscriptionId: string; cycles: Cycle[] };

async function eligibleCycles(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
) {
  if (!(await cardsReady(client)) || !(await cardCyclesReady(client)))
    return [];
  const alerts = await listCardCycleAlerts(
    client,
    ownerId,
    await listCards(client, ownerId),
    today,
  );
  return alerts.filter(
    ({ alert, dueOn }) => alert === "pending" && dueOn >= today,
  );
}

export async function claimCardPush(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
) {
  if (!(await cardPushReady(client))) return [];
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM finance.card_push_subscriptions
      WHERE owner_id = $1 AND enabled AND (expires_at IS NULL OR expires_at > now())
      ORDER BY id`,
    [ownerId],
  );
  if (!rows.length) return [];
  const cycles = (await eligibleCycles(client, ownerId, today)).sort(
    (a, b) =>
      a.cardId.localeCompare(b.cardId) ||
      a.period.localeCompare(b.period) ||
      a.currency.localeCompare(b.currency),
  );
  const claims: PushClaim[] = [];
  for (const { id } of rows) {
    const claimed: Cycle[] = [];
    for (const { cardId, period, currency } of cycles) {
      const { rowCount } = await client.query(
        `INSERT INTO finance.card_push_attempts(owner_id, subscription_id, card_id, period, currency)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [ownerId, id, cardId, `${period}-01`, currency],
      );
      if (rowCount) claimed.push({ cardId, period, currency });
    }
    if (claimed.length) claims.push({ subscriptionId: id, cycles: claimed });
  }
  return claims;
}

export async function deliverCardPush(
  client: pg.PoolClient,
  ownerId: string,
  today: string,
  claim: PushClaim,
  send: (subscription: PushSubscription) => Promise<number>,
) {
  // Recheck opt-in and hold the device row through the bounded send. Use a
  // non-key lock so claiming another cycle does not conflict with the FK.
  const {
    rows: [device],
  } = await client.query<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `SELECT endpoint, p256dh, auth FROM finance.card_push_subscriptions
      WHERE (owner_id, id) = ($1, $2) AND enabled
        AND (expires_at IS NULL OR expires_at > now())
      FOR NO KEY UPDATE`,
    [ownerId, claim.subscriptionId],
  );
  if (!device) return;
  const { endpoint, p256dh, auth } = device;
  const eligible = await eligibleCycles(client, ownerId, today);
  if (
    !claim.cycles.some((cycle) =>
      eligible.some(
        ({ cardId, period, currency }) =>
          cardId === cycle.cardId &&
          period === cycle.period &&
          currency === cycle.currency,
      ),
    )
  )
    return;
  const status = await send({
    endpoint,
    expirationTime: null,
    keys: { p256dh, auth },
  });
  if (status === 404 || status === 410) {
    await disableCardPush(client, ownerId, endpoint);
  } else if (status < 200 || status >= 300) {
    throw new Error("Envío push no confirmado");
  }
}

export async function sendCardPush(
  subscription: PushSubscription,
  vapid: VapidKeys,
) {
  if (!isCardPushEndpoint(subscription.endpoint))
    throw new Error("Destino push inválido");
  const payload = await buildPushPayload(
    { data: "card-due", options: { ttl: 3600 } },
    subscription,
    vapid,
  );
  const response = await fetch(subscription.endpoint, {
    ...payload,
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  await response.body?.cancel();
  return response.status;
}
