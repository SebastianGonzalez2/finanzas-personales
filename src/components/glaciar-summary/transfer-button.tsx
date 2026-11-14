"use client";

import { Button } from "../ui/button";
import { Icon } from "../ui/icon";

export function TransferButton({ available }: { available: boolean }) {
  return (
    <Button
      variant="glass"
      data-tour="cambio-moneda"
      aria-controls={available ? "nueva-transaccion" : undefined}
      disabled={!available}
      onClick={() =>
        document
          .querySelector<HTMLButtonElement>("[data-open-bank-transfer]")
          ?.click()
      }
    >
      <Icon name="swap" duotone={false} className="size-4" />
      Cambio de moneda
    </Button>
  );
}
