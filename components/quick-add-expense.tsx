"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";

type Kind = "expense" | "recurring" | "possible";

const OPTIONS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Gasto" },
  { value: "recurring", label: "Recurrente" },
  { value: "possible", label: "Posible" },
];

const HINTS: Record<Kind, string> = {
  expense: "Un gasto puntual que ya hiciste: corte de pelo, helado, ropa…",
  recurring: "Se cobra cada mes en el día de la fecha elegida: suscripciones, alquiler, gimnasio…",
  possible: "No cuenta en tus gastos hasta que lo confirmes en la columna “Posibles”.",
};

export function QuickAddExpense({
  today,
  onAdd,
}: {
  today: string;
  onAdd: (data: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<Kind>("expense");
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      await onAdd(data);
      formRef.current?.reset();
      setKind("expense");
      formRef.current?.querySelector<HTMLInputElement>("[name=name]")?.focus();
    });
  }

  return (
    <section className="card card-neg">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-neg">Nuevo gasto</h2>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="seg grid-cols-3 sm:col-span-2">
          {OPTIONS.map((o) => (
            <label key={o.value}>
              <input
                type="radio"
                name="kind"
                value={o.value}
                checked={kind === o.value}
                onChange={() => setKind(o.value)}
                className="sr-only"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <label className="field sm:col-span-2">
          Qué es
          <input
            name="name"
            required
            autoFocus
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
          Importe (€)
          <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" className="input" />
        </label>
        <label className="field">
          Fecha
          <input name="date" type="date" defaultValue={today} required className="input" />
        </label>
        <p className="rounded-[14px] bg-surface-2/40 px-3.5 py-2.5 text-xs text-dim sm:col-span-2">
          {HINTS[kind]}
        </p>
        <button type="submit" disabled={pending} className="btn btn-neg sm:col-span-2">
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
    </section>
  );
}
