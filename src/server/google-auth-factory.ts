import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { PostgresDialect } from "kysely";
import type pg from "pg";
import {
  normalizeGoogleEmail,
  verifiedGoogleProfile,
} from "./google-policy.ts";
export function createGoogleAuth(
  pool: pg.Pool,
  config: {
    origin: string;
    secret: string;
    clientId: string;
    clientSecret: string;
  },
) {
  // Only verified provider facts travel between the two hooks, scoped to the
  // library's request context. Policy and identity binding always live in SQL.
  const verifiedRequests = new WeakMap<
    object,
    { email: string; subject: string }
  >();
  const denied = () => {
    throw new APIError("FORBIDDEN", {
      code: "ACCESS_DENIED",
      message: "Acceso no autorizado.",
    });
  };
  async function checkIdentity(email: string, subject: string) {
    const { rows } = await pool.query(
      `SELECT email,google_sub,user_id,enabled FROM app_access.allowlist WHERE email=$1 OR google_sub=$2`,
      [email, subject],
    );
    if (!(
      rows.length === 1 &&
      rows[0].enabled &&
      rows[0].email === email &&
      (!rows[0].google_sub || rows[0].google_sub === subject)
    )) {
      await pool.query(
        `DELETE FROM app_auth.session WHERE "userId" IN (SELECT user_id FROM app_access.allowlist WHERE google_sub=$1)`,
        [subject],
      );
      denied();
    }
  }
  return betterAuth({
    appName: "Finanzas personales",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.origin],
    database: {
      dialect: new PostgresDialect({ pool }),
      type: "postgres",
      schemaName: "app_auth",
      transaction: true,
    },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        disableIdTokenSignIn: true,
        accessType: "online",
        prompt: "select_account",
        mapProfileToUser: async (profile) => {
          const identity = verifiedGoogleProfile(profile);
          return {
            email: identity.email,
            emailVerified: true,
          };
        },
      },
    },
    user: {
      additionalFields: {
        googleSubject: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      validateUserInfo: async ({ user, source }, context) => {
        if (
          source.method !== "oauth" ||
          source.oauth?.providerId !== "google" ||
          source.action === "link-account"
        )
          return denied();
        const identity = verifiedGoogleProfile(source.oauth.profile);
        if (
          user.emailVerified !== true ||
          normalizeGoogleEmail(user.email) !== identity.email
        )
          return denied();
        await checkIdentity(identity.email, identity.subject);
        verifiedRequests.set(context, identity);
      },
    },
    account: {
      accountLinking: { enabled: false, disableImplicitLinking: true },
      storeAccountCookie: false,
      updateAccountOnSignIn: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 20 },
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "finanzas-google",
      useSecureCookies: config.origin.startsWith("https:"),
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.origin.startsWith("https:"),
      },
    },
    logger: { disabled: true },
    onAPIError: { errorURL: `${config.origin}/auth/sign-in` },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const identity = context
              ? verifiedRequests.get(context)
              : undefined;
            if (context) verifiedRequests.delete(context);
            if (
              user.emailVerified !== true ||
              !identity ||
              normalizeGoogleEmail(user.email) !== identity.email
            )
              return denied();
            await checkIdentity(
              normalizeGoogleEmail(user.email),
              identity.subject,
            );
            return { data: { ...user, googleSubject: identity.subject } };
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (account.providerId !== "google") return denied();
            return {
              data: {
                ...account,
                accessToken: null,
                refreshToken: null,
                idToken: null,
              },
            };
          },
        },
      },
    },
  });
}
