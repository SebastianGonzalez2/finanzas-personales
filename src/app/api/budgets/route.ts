import { bankReferenceToday } from "@/domain/bank-balances";
import { parseBudgetCommand } from "@/domain/budgets";
import {
  budgetsReady,
  refreshBudgetNotices,
  saveBudget,
} from "@/server/budgets";
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
  const today = bankReferenceToday();
  const command = parseBudgetCommand(
    await limitedJson(request).catch(() => null),
    today,
    { checkExceptionWindow: false },
  );
  if ("error" in command) return reply(command, 400);
  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await budgetsReady(client)))
        return reply(
          {
            error:
              "Los presupuestos estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      const result = await saveBudget(client, ownerId, command, today);
      if (result.status === "conflict")
        return reply({ error: result.message }, 409);
      if (result.status === "not-found")
        return reply(
          { error: "El presupuesto o la categoría no están disponibles." },
          404,
        );
      if (result.status !== "replayed")
        await refreshBudgetNotices(client, ownerId, today.slice(0, 7));
      return reply({ id: result.id }, result.status === "created" ? 201 : 200);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply(
        { error: "Volvé a entrar para gestionar presupuestos." },
        401,
      );
    return reply(
      { error: "No pudimos confirmar el guardado. Reintentá el mismo envío." },
      503,
    );
  }
}
