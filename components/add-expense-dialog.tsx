"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";

export function AddExpenseDialog({
  kind,
  today,
  onAdd,
  onClose,
}: {
  kind: "recurring" | "possible";
  today: string;
  onAdd: (data: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const recurring = kind === "recurring";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("kind", kind);
    startTransition(async () => {
      try {
        await onAdd(data);
        onClose();
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={recurring ? "Nuevo recurrente" : "Nuevo posible"}
        onClick={(e) => e.stopPropagation()}
        className="card flex w-full max-w-sm flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            {recurring ? "Nuevo recurrente" : "Nuevo posible"}
          </h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-xs text-dim">
          {recurring
            ? "Se cobra cada mes el día de la fecha elegida."
            : "No cuenta en tus gastos hasta que lo confirmes."}
        </p>
        <label className="field">
          Qué es
          <input
            name="name"
            required
            autoFocus
            placeholder={recurring ? "Netflix, alquiler, gimnasio…" : "Camisa, zapatillas, viaje…"}
            className="input"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            Importe (€)
            <input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" className="input" />
          </label>
          <label className="field">
            Fecha
            <input name="date" type="date" defaultValue={today} required className="input" />
          </label>
        </div>
        {error && <p className="text-sm font-medium text-neg">{error}</p>}
        <button type="submit" disabled={pending} className="btn btn-neg mt-1">
          <Plus className="size-4" /> {pending ? "Guardando…" : recurring ? "Añadir recurrente" : "Guardar como posible"}
        </button>
      </form>
    </div>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-icon !size-10 bg-surface-2/60"
      aria-label={label}
      title={label}
    >
      <Plus className="size-6" />
    </button>
  );
}
