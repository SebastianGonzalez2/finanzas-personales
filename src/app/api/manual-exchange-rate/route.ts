import { bankReferenceToday } from "@/domain/bank-balances";
import { parseManualFx } from "@/domain/exchange-rates";
import { exchangeRatesReady, saveManualFx } from "@/server/exchange-rates";
import { currencyRequest } from "@/server/exchange-rate-http";

export function POST(request: Request) {
  return currencyRequest(request, async (client, ownerId, input) => {
    const rate = parseManualFx(input, bankReferenceToday());
    if (!rate) return 400;
    if (!(await exchangeRatesReady(client))) return 503;
    return (await saveManualFx(client, ownerId, rate)) ? 200 : 409;
  });
}
