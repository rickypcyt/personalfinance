"use client";

import { useRef, useTransition } from "react";
import { Plus } from "lucide-react";

export type Kind = "expense" | "recurring" | "possible";

export const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Puntual" },
  { value: "recurring", label: "Recurrente" },
  { value: "possible", label: "Posible" },
];

const HINTS: Record<Kind, string> = {
  expense: "Un gasto que ya hiciste: corte de pelo, helado, ropa…",
  recurring: "Se cobra cada mes el día de la fecha elegida: suscripciones, alquiler…",
  possible: "No cuenta en tus gastos hasta que lo confirmes en “Posibles”.",
};

export function KindSelector({ kind, onChange }: { kind: Kind; onChange: (k: Kind) => void }) {
  return (
    <div className="seg grid-cols-3">
      {KIND_OPTIONS.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name="kind-selector"
            value={o.value}
            checked={kind === o.value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export function QuickAddExpense({
  today,
  kind,
  onKindChange,
  onAdd,
}: {
  today: string;
  kind: Kind;
  onKindChange: (k: Kind) => void;
  onAdd: (data: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("kind", kind);
    startTransition(async () => {
      await onAdd(data);
      formRef.current?.reset();
      onKindChange("expense");
      formRef.current?.querySelector<HTMLInputElement>("[name=amount]")?.focus();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="flex flex-1 flex-col gap-4"
      >
        <KindSelector kind={kind} onChange={onKindChange} />

        {/* Importe grande */}
        <div className="rounded-[20px] border border-line/15 bg-surface-2/40 p-4 transition focus-within:border-neg/50 focus-within:ring-4 focus-within:ring-neg/10">
          <div className="flex h-8 items-center">
            <span className="line-clamp-2 text-xs font-medium leading-4 text-dim">{HINTS[kind]}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-dim">€</span>
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
          Qué es
          <input
            name="name"
            required
            placeholder={
              kind === "possible"
                ? "Camisa, zapatillas, viaje…"
                : kind === "recurring"
                  ? "Netflix, alquiler, gimnasio…"
                  : "Corte de pelo, helado, ropa…"
            }
            className="input"
          />
        </label>
        <label className="field">
          Fecha
          <input name="date" type="date" defaultValue={today} required className="input" />
        </label>

        <button type="submit" disabled={pending} className="btn btn-neg mt-auto">
          <Plus className="size-4" />{" "}
          {pending
            ? "Guardando…"
            : kind === "possible"
              ? "Guardar como posible"
              : kind === "recurring"
                ? "Añadir recurrente"
                : "Añadir gasto"}
        </button>
      </form>
    </div>
  );
}
