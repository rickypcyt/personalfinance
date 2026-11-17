"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";

export function QuickAddIncome({
  today,
  onAdd,
}: {
  today: string;
  onAdd: (data: FormData) => Promise<{ error: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await onAdd(data);
      setError(res.error);
      if (!res.error) {
        formRef.current?.reset();
        formRef.current?.querySelector<HTMLInputElement>("[name=description]")?.focus();
      }
    });
  }

  return (
    <section className="card card-pos">
      <h2 className="mb-0.5 text-xl font-bold tracking-tight text-pos">Nuevo ingreso</h2>
      <p className="mb-4 text-xs text-dim">Los dólares se pasan a euros con el cambio de Revolut.</p>
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="field sm:col-span-2">
          De dónde viene
          <input name="description" required placeholder="Nómina, freelance, venta…" className="input" />
        </label>
        <label className="field">
          Importe
          <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" className="input" />
        </label>
        <div className="field">
          Moneda
          <div className="seg">
            <label>
              <input type="radio" name="currency" value="EUR" defaultChecked className="sr-only" />
              <span>€ EUR</span>
            </label>
            <label>
              <input type="radio" name="currency" value="USD" className="sr-only" />
              <span>$ USD</span>
            </label>
          </div>
        </div>
        <label className="field sm:col-span-2">
          Fecha
          <input name="date" type="date" defaultValue={today} required className="input" />
        </label>
        {error && <p className="text-base font-medium text-neg sm:col-span-2">{error}</p>}
        <button type="submit" disabled={pending} className="btn btn-pos sm:col-span-2">
          <Plus className="size-4" /> {pending ? "Guardando…" : "Añadir ingreso"}
        </button>
      </form>
    </section>
  );
}
