"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ComponentProps } from "react";
import { CreditOperationForm } from "./credit-operation-form";
import { historyButton } from "./history-fields";

type Props = Omit<
  ComponentProps<typeof CreditOperationForm>,
  "action" | "close" | "installmentsReady"
>;

export function MixedPurchaseEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  return open ? (
    <CreditOperationForm
      {...props}
      action="purchase"
      installmentsReady
      close={(message) => {
        setOpen(false);
        if (message) router.refresh();
        requestAnimationFrame(() =>
          (
            trigger.current ?? document.getElementById("titulo-pagina")
          )?.focus(),
        );
      }}
    />
  ) : (
    <button
      type="button"
      ref={trigger}
      className={`${historyButton} justify-self-start`}
      onClick={() => setOpen(true)}
    >
      Corregir compra con dos medios
    </button>
  );
}
