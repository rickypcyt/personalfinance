"use client";

import { useState, useTransition } from "react";
import { updateExpenseDate, updateIncomeDate } from "@/app/actions";

export function EditableDate({
  id,
  value,
  kind,
  locked,
  onLocked,
}: {
  id: string;
  value: string;
  kind: "expense" | "income";
  locked?: boolean;
  onLocked?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (!next || next === value) return;
    startTransition(async () => {
      const res = await (kind === "income" ? updateIncomeDate : updateExpenseDate)(id, next);
      setError(res.error);
    });
  }

  if (locked) {
    const [y, m, d] = value.split("-");
    return (
      <button type="button" onClick={onLocked} className="date-edit">
        {d}/{m}/{y}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <input
        type="date"
        defaultValue={value}
        onChange={onChange}
        disabled={pending}
        aria-label="Cambiar fecha"
        className="date-edit"
      />
      {error && <span className="text-xs text-neg">{error}</span>}
    </span>
  );
}
