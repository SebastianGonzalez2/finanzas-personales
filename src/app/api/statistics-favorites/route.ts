import {
  statisticsChartIdList,
  type StatisticsChartId,
} from "@/domain/statistics";
import {
  listStatisticsFavorites,
  setStatisticsFavorite,
  statisticsFavoritesReady,
} from "@/server/statistics";
import { withGoogleOwner } from "@/server/google-auth";
import { googlePrivateHeaders } from "@/server/google-http";
import { authOrigin, limitedJson } from "@/server/google-policy";

export const runtime = "nodejs";

function reply(
  body: { error: string } | { favorites: StatisticsChartId[] },
  status: number,
) {
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

  const input = await limitedJson(request).catch(() => null);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "chartId" && key !== "favorite") ||
    typeof input.chartId !== "string" ||
    !statisticsChartIdList.includes(input.chartId as StatisticsChartId) ||
    typeof input.favorite !== "boolean"
  )
    return reply({ error: "Solicitud inválida." }, 400);

  try {
    return await withGoogleOwner(request, async (client, ownerId) => {
      if (!(await statisticsFavoritesReady(client)))
        return reply(
          {
            error:
              "Los favoritos estarán disponibles cuando se actualice la base de datos.",
          },
          409,
        );
      await setStatisticsFavorite(
        client,
        ownerId,
        input.chartId as StatisticsChartId,
        input.favorite,
      );
      return reply(
        { favorites: await listStatisticsFavorites(client, ownerId) },
        200,
      );
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Acceso denegado")
      return reply({ error: "Volvé a entrar para guardar favoritos." }, 401);
    return reply(
      { error: "No pudimos guardar el favorito. Reintentá el mismo envío." },
      503,
    );
  }
}
