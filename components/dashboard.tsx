"use client";

import { useOptimistic, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, LogOut, Repeat, X } from "lucide-react";
import {
  addFixedExpense,
  addIncome as addIncomeAction,
  confirmPossibleExpense,
  deleteFixedExpense,
  deleteIncome,
  logout,
} from "@/app/actions";
import { QuickAddExpense } from "@/components/quick-add-expense";
import { QuickAddIncome } from "@/components/quick-add-income";
import { EditableDate } from "@/components/editable-date";

export type Expense = {
  id: string;
  name: string;
  amount: number;
  recurring: boolean;
  possible: boolean;
  day: number;
  spentOn: string | null;
  pending?: boolean;
};

export type Income = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  rate: number | null;
  feePct: number | null;
  amountEur: number;
  receivedOn: string;
  pending?: boolean;
};

type State = { expenses: Expense[]; incomes: Income[] };
type Op =
  | { type: "addExpense"; item: Expense }
  | { type: "addIncome"; item: Income }
  | { type: "removeExpense"; id: string }
  | { type: "removeIncome"; id: string }
  | { type: "confirm"; id: string; today: string; day: number };

function reduce(state: State, op: Op): State {
  switch (op.type) {
    case "addExpense":
      return { ...state, expenses: [op.item, ...state.expenses] };
    case "addIncome":
      return { ...state, incomes: [op.item, ...state.incomes] };
    case "removeExpense":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== op.id) };
    case "removeIncome":
      return { ...state, incomes: state.incomes.filter((i) => i.id !== op.id) };
    case "confirm":
      return {
        ...state,
        expenses: state.expenses.map((e) =>
          e.id === op.id
            ? { ...e, possible: false, recurring: false, spentOn: op.today, day: op.day }
            : e,
        ),
      };
  }
}

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fmtDate = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const fromIso = (s: string) => new Date(s + "T00:00:00");
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function nextCharge(day: number, today: Date) {
  const make = (y: number, m: number) =>
    new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  let d = make(today.getFullYear(), today.getMonth());
  if (d < today) d = make(today.getFullYear(), today.getMonth() + 1);
  return { date: d, days: Math.round((d.getTime() - today.getTime()) / 86400000) };
}

export function Dashboard({
  initial,
  todayIso,
  userName,
}: {
  initial: State;
  todayIso: string;
  userName: string;
}) {
  const [state, apply] = useOptimistic(initial, reduce);
  const [, startTransition] = useTransition();
  const { expenses: all, incomes } = state;

  const today = fromIso(todayIso);
  const monthKey = todayIso.slice(0, 7);
  const monthName = today.toLocaleDateString("es-ES", { month: "long" });

  // Acciones con respuesta inmediata: se llaman dentro de una transición.
  async function addExpense(data: FormData) {
    const kind = data.get("kind");
    const date = String(data.get("date") ?? todayIso);
    apply({
      type: "addExpense",
      item: {
        id: `tmp-${Date.now()}`,
        name: String(data.get("name") ?? "").trim(),
        amount: Number(data.get("amount")),
        recurring: kind === "recurring",
        possible: kind === "possible",
        day: Number(date.slice(8, 10)),
        spentOn: date,
        pending: true,
      },
    });
    await addFixedExpense(data);
  }

  async function addIncome(data: FormData) {
    const currency = data.get("currency") === "USD" ? "USD" : "EUR";
    const amount = Number(data.get("amount"));
    const lastRate = incomes.find((i) => i.currency === "USD" && i.rate)?.rate ?? 0.9;
    apply({
      type: "addIncome",
      item: {
        id: `tmp-${Date.now()}`,
        description: String(data.get("description") ?? "").trim(),
        amount,
        currency,
        rate: null,
        feePct: null,
        amountEur: currency === "USD" ? Math.round(amount * lastRate * 0.995 * 100) / 100 : amount,
        receivedOn: String(data.get("date") ?? todayIso),
        pending: true,
      },
    });
    return addIncomeAction(data);
  }

  function removeExpense(id: string) {
    startTransition(async () => {
      apply({ type: "removeExpense", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteFixedExpense(fd);
    });
  }

  function removeIncome(id: string) {
    startTransition(async () => {
      apply({ type: "removeIncome", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteIncome(fd);
    });
  }

  function confirm(id: string) {
    startTransition(async () => {
      apply({ type: "confirm", id, today: todayIso, day: today.getDate() });
      const fd = new FormData();
      fd.set("id", id);
      await confirmPossibleExpense(fd);
    });
  }

  const possibles = all.filter((i) => i.possible);
  const confirmed = all.filter((i) => !i.possible);
  const recurring = confirmed
    .filter((i) => i.recurring)
    .map((i) => ({ ...i, next: nextCharge(i.day, today) }))
    .sort((a, b) => a.next.days - b.next.days);
  const oneOff = confirmed
    .filter((i) => !i.recurring)
    .sort((a, b) => (b.spentOn ?? "").localeCompare(a.spentOn ?? ""));

  const recurringTotal = recurring.reduce((s, i) => s + i.amount, 0);
  const oneOffMonth = oneOff
    .filter((i) => i.spentOn?.startsWith(monthKey))
    .reduce((s, i) => s + i.amount, 0);
  const expensesMonth = recurringTotal + oneOffMonth;
  const incomeMonth = incomes
    .filter((i) => i.receivedOn.startsWith(monthKey))
    .reduce((s, i) => s + i.amountEur, 0);
  const balance = incomeMonth - expensesMonth;
  const upcoming = recurring[0];
  const spentPct =
    incomeMonth > 0 ? Math.min(100, (expensesMonth / incomeMonth) * 100) : expensesMonth > 0 ? 100 : 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="shrink-0">
          <p className="eyebrow">Finanzas personales</p>
          <h1 className="text-2xl font-bold tracking-tight">Hola, {userName}</h1>
        </div>
        <form action={logout} className="shrink-0">
          <button type="submit" className="btn-ghost">
            <LogOut className="size-4" /> Salir
          </button>
        </form>
      </header>

      {/* Resumen */}
      <section className="card mb-4 grid items-center gap-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow capitalize">Balance de {monthName}</p>
          <p
            className={`mt-1 text-4xl font-bold tracking-tight md:text-5xl ${
              balance < 0 ? "text-neg" : ""
            }`}
          >
            {eur.format(balance)}
          </p>
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${spentPct >= 100 ? "bg-neg" : "bg-fg"}`}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-dim">
              {incomeMonth > 0
                ? `Has gastado el ${Math.round((expensesMonth / incomeMonth) * 100)} % de tus ingresos`
                : expensesMonth > 0
                  ? "Sin ingresos este mes"
                  : "Sin movimientos este mes"}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            icon={<ArrowDownLeft className="size-4" />}
            tone="pos"
            label="Ingresos"
            value={`+${eur.format(incomeMonth)}`}
            hint={`${incomes.filter((i) => i.receivedOn.startsWith(monthKey)).length} este mes`}
          />
          <Stat
            icon={<ArrowUpRight className="size-4" />}
            tone="neg"
            label="Gastos"
            value={`−${eur.format(expensesMonth)}`}
            hint={`${eur.format(recurringTotal)} fijos · ${eur.format(oneOffMonth)} puntuales`}
          />
          <Stat
            icon={<Repeat className="size-4" />}
            label="Recurrentes"
            value={eur.format(recurringTotal)}
            hint={`${recurring.length} cada mes`}
          />
          <Stat
            icon={<CalendarClock className="size-4" />}
            label="Próximo cobro"
            value={upcoming ? upcoming.name : "—"}
            hint={
              upcoming
                ? `${fmtDate(upcoming.next.date)} · ${
                    upcoming.next.days === 0 ? "hoy" : `en ${upcoming.next.days} días`
                  }`
                : "Sin cobros"
            }
          />
        </dl>
      </section>

      {/* Añadir rápido */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <QuickAddIncome today={iso(today)} onAdd={addIncome} />
        <QuickAddExpense today={iso(today)} onAdd={addExpense} />
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {/* Ingresos */}
      <Group title="Ingresos" total={`+${eur.format(incomes.reduce((s, i) => s + i.amountEur, 0))}`} empty="Aún no hay ingresos." count={incomes.length}>
        {incomes.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{i.description}</p>
              <div className="flex flex-wrap items-center gap-x-2">
                <EditableDate id={i.id} value={i.receivedOn} kind="income" />
                {i.currency === "USD" && i.rate !== null && (
                  <span className="text-xs text-dim">
                    ${i.amount.toFixed(2)} · {i.rate.toFixed(3)} · fee {i.feePct}%
                  </span>
                )}
              </div>
            </div>
            <span className="text-lg font-bold text-pos">+{eur.format(i.amountEur)}</span>
            <DeleteButton onClick={() => removeIncome(i.id)} />
          </article>
        ))}
      </Group>

      {/* Recurrentes */}
      <Group title="Recurrentes" total={eur.format(recurringTotal)} empty="Activa “Se repite cada mes” al añadir un gasto." count={recurring.length}>
        {recurring.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{i.name}</p>
              <div className="flex flex-wrap items-center gap-x-2">
                <EditableDate id={i.id} value={i.spentOn ?? iso(i.next.date)} kind="expense" />
                <span className={i.next.days <= 3 ? "text-xs font-medium text-neg" : "text-xs text-dim"}>
                  Día {i.day} · {i.next.days === 0 ? "hoy" : `en ${i.next.days} d`}
                </span>
              </div>
            </div>
            <span className="text-lg font-bold">{eur.format(i.amount)}</span>
            <DeleteButton onClick={() => removeExpense(i.id)} />
          </article>
        ))}
      </Group>

      {/* Puntuales */}
      <Group title="Puntuales" total={eur.format(oneOff.reduce((s, i) => s + i.amount, 0))} empty="Aún no hay gastos puntuales." count={oneOff.length}>
        {oneOff.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{i.name}</p>
              <EditableDate id={i.id} value={i.spentOn ?? iso(today)} kind="expense" />
            </div>
            <span className="text-lg font-bold">{eur.format(i.amount)}</span>
            <DeleteButton onClick={() => removeExpense(i.id)} />
          </article>
        ))}
      </Group>

      {/* Posibles */}
      <Group title="Posibles" total={eur.format(possibles.reduce((s, i) => s + i.amount, 0))} empty="Guarda aquí lo que quieres comprar y aún no." count={possibles.length}>
        {possibles.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{i.name}</p>
              <p className="text-xs text-dim">Pendiente de decidir</p>
            </div>
            <span className="text-lg font-bold">{eur.format(i.amount)}</span>
            <button type="button" onClick={() => confirm(i.id)} className="btn-icon hover:!bg-pos/15 hover:!text-pos" aria-label="Confirmar compra" title="Confirmar: ya lo compré">
              <Check className="size-4" />
            </button>
            <button type="button" onClick={() => removeExpense(i.id)} className="btn-icon hover:!bg-neg/15 hover:!text-neg" aria-label="Rechazar" title="Rechazar: no lo compro">
              <X className="size-4" />
            </button>
          </article>
        ))}
      </Group>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "pos" | "neg";
}) {
  const iconTone =
    tone === "pos" ? "bg-pos/15 text-pos" : tone === "neg" ? "bg-neg/15 text-neg" : "bg-line text-fg";
  return (
    <div className="min-w-0 rounded-2xl bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex size-7 items-center justify-center rounded-full ${iconTone}`}>
          {icon}
        </span>
        <dt className="text-xs font-medium text-dim">{label}</dt>
      </div>
      <dd className="truncate text-lg font-bold">{value}</dd>
      {hint && <p className="truncate text-xs text-dim">{hint}</p>}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-icon" aria-label="Eliminar">
      <X className="size-4" />
    </button>
  );
}

function Group({
  title,
  total,
  empty,
  count,
  children,
}: {
  title: string;
  total: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <span className="text-base font-medium text-dim">{total}</span>
      </div>
      {count === 0 ? (
        <p className="py-6 text-base text-dim">{empty}</p>
      ) : (
        <div className="no-scrollbar flex max-h-[17rem] flex-col gap-3 overflow-y-auto">
          {children}
        </div>
      )}
    </section>
  );
}
