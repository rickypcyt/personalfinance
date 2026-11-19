"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import type { Vault } from "@/components/dashboard";

export function QuickAddIncome({
  today,
  vaults,
  onAdd,
}: {
  today: string;
  vaults: Vault[];
  onAdd: (data: FormData) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [vaultId, setVaultId] = useState("");
  // Solo vaults ya guardados (los optimistas aún no tienen id real).
  const targets = vaults.filter((v) => !v.pending);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await onAdd(data);
      setError(res.error);
      if (!res.error) {
        formRef.current?.reset();
        setCurrency("EUR");
        setVaultId("");
        formRef.current?.querySelector<HTMLInputElement>("[name=amount]")?.focus();
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="flex flex-1 flex-col gap-4"
      >
        {/* Destino: cuenta principal o vault */}
        <div>
          <div
            className="seg"
            style={{ gridTemplateColumns: `repeat(${targets.length + 1}, minmax(0, 1fr))` }}
          >
            {[{ id: "", name: "Cuenta principal" }, ...targets].map((o) => (
              <label key={o.id || "main"} title={o.name} className="min-w-0 px-2">
                <input
                  type="radio"
                  name="vaultId"
                  value={o.id}
                  checked={vaultId === o.id}
                  onChange={() => setVaultId(o.id)}
                  className="sr-only"
                />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Importe grande */}
        <div className="rounded-[20px] border border-line/15 bg-surface-2/40 p-4 transition focus-within:border-pos/50 focus-within:ring-4 focus-within:ring-pos/10">
          <div className="flex h-8 items-center justify-between gap-2">
            <span className="line-clamp-2 text-xs font-medium leading-4 text-dim">
              {currency === "USD" ? "Se pasa a euros con el cambio de Revolut." : "Nuevo ingreso"}
            </span>
            <div className="seg !h-8 !rounded-full !p-0.5">
              {(["EUR", "USD"] as const).map((c) => (
                <label key={c} className="!rounded-full px-3">
                  <input
                    type="radio"
                    name="currency"
                    value={c}
                    checked={currency === c}
                    onChange={() => setCurrency(c)}
                    className="sr-only"
                  />
                  <span className="text-xs">{c === "EUR" ? "€ EUR" : "$ USD"}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-dim">{currency === "EUR" ? "€" : "$"}</span>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0,00"
              className="w-full bg-transparent text-4xl font-semibold tracking-tight text-fg outline-none placeholder:text-dim/40"
            />
          </div>
        </div>

        <label className="field">
          De dónde viene
          <input name="description" required placeholder="Nómina, freelance, venta…" className="input" />
        </label>
        <label className="field">
          Fecha
          <input name="date" type="date" defaultValue={today} required className="input" />
        </label>


        {error && <p className="text-sm font-medium text-neg">{error}</p>}
        <button type="submit" disabled={pending} className="btn btn-pos mt-auto">
          <Plus className="size-4" /> {pending ? "Guardando…" : "Añadir ingreso"}
        </button>
      </form>
    </div>
  );
}
