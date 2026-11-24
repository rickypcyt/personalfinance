"use client";

import { CalcAmountInput, CalcHint } from "@/components/calc-amount-input";
import { useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import type { Expense, Income } from "@/components/dashboard";

type Kind = "expense" | "recurring" | "possible";

const KINDS: { value: Kind; label: string }[] = [
  { value: "expense", label: "Puntual" },
  { value: "recurring", label: "Recurrente" },
  { value: "possible", label: "Posible" },
];

export type Editing =
  | { type: "expense"; item: Expense; fallbackDate: string }
  | { type: "income"; item: Income };

export function EditItemDialog({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Editing;
  onClose: () => void;
  onSave: (data: FormData) => Promise<{ error: string | null }>;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isIncome = editing.type === "income";
  const item = editing.item;

  const initialKind: Kind =
    editing.type === "expense"
      ? editing.item.possible
        ? "possible"
        : editing.item.recurring
          ? "recurring"
          : "expense"
      : "expense";
  const [kind, setKind] = useState<Kind>(initialKind);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await onSave(data);
      if (res.error) setError(res.error);
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isIncome ? "Editar ingreso" : "Editar gasto"}
        className="card w-full max-w-md !bg-surface !backdrop-blur-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className={`text-xl font-semibold tracking-tight ${isIncome ? "text-pos" : "text-neg"}`}>
            {isIncome ? "Editar ingreso" : "Editar gasto"}
          </h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          {editing.type === "expense" && (
            <div className="seg grid-cols-3 sm:col-span-2">
              {KINDS.map((o) => (
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
          )}

          <label className="field sm:col-span-2">
            {isIncome ? "De dónde viene" : "Qué es"}
            <input
              name={isIncome ? "description" : "name"}
              required
              defaultValue={editing.type === "income" ? editing.item.description : editing.item.name}
              className="input"
            />
          </label>

          <label className="field">
            {isIncome ? "Importe" : "Importe (€)"}
            <CalcAmountInput className="input" initial={String(item.amount)} />
          </label>

          {editing.type === "income" ? (
            <div className="field">
              Moneda
              <div className="seg">
                <label>
                  <input
                    type="radio"
                    name="currency"
                    value="EUR"
                    defaultChecked={editing.item.currency !== "USD"}
                    className="sr-only"
                  />
                  <span>€ EUR</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="currency"
                    value="USD"
                    defaultChecked={editing.item.currency === "USD"}
                    className="sr-only"
                  />
                  <span>$ USD</span>
                </label>
              </div>
            </div>
          ) : (
            <label className="field">
              Fecha
              <input
                name="date"
                type="date"
                required
                defaultValue={editing.item.spentOn ?? editing.fallbackDate}
                className="input"
              />
            </label>
          )}

          {editing.type === "income" && (
            <label className="field sm:col-span-2">
              Fecha
              <input
                name="date"
                type="date"
                required
                defaultValue={editing.item.receivedOn}
                className="input"
              />
            </label>
          )}

          {error && <p className="text-base font-medium text-neg sm:col-span-2">{error}</p>}

          <div className="mt-2 flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost !h-11 hover:!bg-neg/15 hover:!text-neg"
              aria-label="Eliminar"
              title="Eliminar"
            >
              <Trash2 className="size-4" />
            </button>
            <button type="submit" disabled={pending} className="btn flex-1">
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
