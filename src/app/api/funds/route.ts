import { parseFundCommand } from "@/domain/savings-funds";
import { savingsFundsReady } from "@/server/bank-balances";
import { saveSavingsFund } from "@/server/savings-funds";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(body: { error: string } | { id: string }, status: number) {
  return Response.json(body, { status, headers: googlePrivateHeaders });
}

export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
        authOrigin(process.env.GOOGLE_AUTH_ORIGIN) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new Error();
  } catch {
    return reply({ error: "Solicitud no autorizada." }, 403);
  }
  if (new URL(request.url).search)
    return reply({ error: "Solicitud inválida." }, 400);
  const command = parseFundCommand(
    await limitedJson(request).catch(() => null),
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await savingsFundsReady(client)))
        return reply(
          {
            error:
              "Los fondos estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      // A database guard also protects reserve writers introduced independently.
      await client.query("SAVEPOINT save_fund");
      const result = await saveSavingsFund(client, ownerId, command).catch(
        async (error: unknown) => {
          if (
            !(error instanceof Error) ||
            !("constraint" in error) ||
            error.constraint !== "protect_fund_commitments"
          )
            throw error;
          await client.query("ROLLBACK TO SAVEPOINT save_fund");
          return {
            status: "conflict",
            message:
              "Hay compras de tarjeta que todavía usan esta reserva. Revisá los compromisos antes de liberar o cerrar el fondo.",
          } as const;
        },
      );
      await client.query("RELEASE SAVEPOINT save_fund");
      switch (result.status) {
        case "unavailable":
          return reply(
            {
              error:
                "Esta operación de fondos estará disponible cuando se actualice la base de datos.",
            },
            409,
          );
        case "conflict":
          return reply({ error: result.message }, 409);
        case "not-found":
          return reply({ error: "El fondo no está disponible." }, 404);
        default:
          return reply(
            { id: result.id },
            result.status === "created" ? 201 : 200,
          );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para gestionar fondos." }, 401);
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
