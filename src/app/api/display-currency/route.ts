import { isCurrency } from "@/domain/exchange-rates";
import {
  exchangeRatesReady,
  saveDisplayCurrency,
} from "@/server/exchange-rates";
import { currencyRequest } from "@/server/exchange-rate-http";

export function POST(request: Request) {
  return currencyRequest(request, async (client, ownerId, input) => {
    if (Object.keys(input).length !== 1 || !isCurrency(input.currency))
      return 400;
    if (!(await exchangeRatesReady(client))) return 503;
    await saveDisplayCurrency(client, ownerId, input.currency);
    return 200;
  });
}
