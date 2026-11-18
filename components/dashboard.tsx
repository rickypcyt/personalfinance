"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, LogOut, Pencil, Repeat, X } from "lucide-react";
import {
  addFixedExpense,
  addIncome as addIncomeAction,
  confirmPossibleExpense,
  deleteFixedExpense,
  deleteIncome,
  logout,
  updateExpense,
  updateIncome,
} from "@/app/actions";
import { QuickAddExpense } from "@/components/quick-add-expense";
import { QuickAddIncome } from "@/components/quick-add-income";
import { EditItemDialog, type Editing } from "@/components/edit-item-dialog";

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
  | { type: "confirm"; id: string; today: string; day: number }
  | { type: "updateExpense"; id: string; patch: Partial<Expense> }
  | { type: "updateIncome"; id: string; patch: Partial<Income> };

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
    case "updateExpense":
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === op.id ? { ...e, ...op.patch, pending: true } : e)),
      };
    case "updateIncome":
      return {
        ...state,
        incomes: state.incomes.map((i) => (i.id === op.id ? { ...i, ...op.patch, pending: true } : i)),
      };
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
const fmtIso = (s: string) =>
  fromIso(s).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
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
  demo = false,
}: {
  initial: State;
  todayIso: string;
  userName: string;
  demo?: boolean;
}) {
  const [state, apply] = useOptimistic(initial, reduce);
  const [, startTransition] = useTransition();
  const [showLogin, setShowLogin] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const { expenses: all, incomes } = state;

  const today = fromIso(todayIso);
  const monthKey = todayIso.slice(0, 7);
  const monthName = today.toLocaleDateString("es-ES", { month: "long" });

  // Acciones con respuesta inmediata: se llaman dentro de una transición.
  async function addExpense(data: FormData) {
    if (demo) {
      setShowLogin(true);
      return;
    }
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
    if (demo) {
      setShowLogin(true);
      return { error: "Inicia sesión para guardar tus datos" };
    }
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
    if (demo) {
      setShowLogin(true);
      return;
    }
    startTransition(async () => {
      apply({ type: "removeExpense", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteFixedExpense(fd);
    });
  }

  function removeIncome(id: string) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    startTransition(async () => {
      apply({ type: "removeIncome", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteIncome(fd);
    });
  }

  function openEdit(e: Editing) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    setEditing(e);
  }

  // Se llama dentro de la transición del diálogo, así la actualización optimista se ve al instante.
  async function saveEdit(data: FormData) {
    if (!editing) return { error: null };
    const amount = Number(data.get("amount"));
    const date = String(data.get("date") ?? todayIso);
    if (editing.type === "expense") {
      const kind = data.get("kind");
      apply({
        type: "updateExpense",
        id: editing.item.id,
        patch: {
          name: String(data.get("name") ?? "").trim(),
          amount,
          recurring: kind === "recurring",
          possible: kind === "possible",
          day: Number(date.slice(8, 10)),
          spentOn: date,
        },
      });
      return updateExpense(editing.item.id, data);
    }
    const currency = data.get("currency") === "USD" ? "USD" : "EUR";
    const rate = editing.item.rate ?? incomes.find((i) => i.currency === "USD" && i.rate)?.rate ?? 0.9;
    const fee = editing.item.feePct ?? 0.5;
    apply({
      type: "updateIncome",
      id: editing.item.id,
      patch: {
        description: String(data.get("description") ?? "").trim(),
        amount,
        currency,
        amountEur: currency === "USD" ? Math.round(amount * rate * (1 - fee / 100) * 100) / 100 : amount,
        receivedOn: date,
      },
    });
    return updateIncome(editing.item.id, data);
  }

  // Cambia solo el importe de un gasto, directamente desde la lista.
  function saveAmount(item: Expense, amount: number) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    if (!(amount > 0) || amount === item.amount) return;
    const date = item.spentOn ?? todayIso;
    const fd = new FormData();
    fd.set("name", item.name);
    fd.set("amount", String(amount));
    fd.set("date", date);
    fd.set("kind", item.possible ? "possible" : item.recurring ? "recurring" : "expense");
    startTransition(async () => {
      apply({ type: "updateExpense", id: item.id, patch: { amount } });
      await updateExpense(item.id, fd);
    });
  }

  function deleteEditing() {
    if (!editing) return;
    const { type, item } = editing;
    setEditing(null);
    if (type === "income") removeIncome(item.id);
    else removeExpense(item.id);
  }

  function confirm(id: string) {
    if (demo) {
      setShowLogin(true);
      return;
    }
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {demo ? "Controla tu dinero en un vistazo" : `Hola, ${userName}`}
          </h1>
        </div>
        {demo ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="btn-ghost">
              Iniciar sesión
            </Link>
            <Link href="/register" className="btn !h-10 !px-5 !text-sm">
              Crear cuenta
            </Link>
          </div>
        ) : (
          <form action={logout} className="shrink-0">
            <button type="submit" className="btn-ghost">
              <LogOut className="size-4" /> Salir
            </button>
          </form>
        )}
      </header>

      {demo && (
        <p className="mb-4 glass rounded-[20px] px-4 py-3 text-sm text-dim">
          Esto es una <span className="font-semibold text-fg">demo con datos de ejemplo</span>. Inicia
          sesión o crea una cuenta para guardar los tuyos.
        </p>
      )}

      {/* Resumen */}
      <section className="card mb-4 grid items-center gap-6 lg:grid-cols-2">
        <div>
          <p className="eyebrow capitalize">Balance de {monthName}</p>
          <p
            className={`mt-1 text-4xl font-semibold tracking-tight md:text-5xl ${
              balance < 0 ? "text-neg" : ""
            }`}
          >
            {eur.format(balance)}
          </p>
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3/50">
              <div
                className={`h-full rounded-full ${spentPct >= 100 ? "bg-neg" : "bg-accent"}`}
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
            <ItemBody
              title={i.description}
              onEdit={() => openEdit({ type: "income", item: i })}
              meta={
                <>
                  {fmtIso(i.receivedOn)}
                  {i.currency === "USD" && i.rate !== null && (
                    <> · ${i.amount.toFixed(2)} · {i.rate.toFixed(3)} · fee {i.feePct}%</>
                  )}
                </>
              }
            />
            <span className="text-lg font-semibold text-pos">+{eur.format(i.amountEur)}</span>
            <EditButton onClick={() => openEdit({ type: "income", item: i })} />
            <DeleteButton onClick={() => removeIncome(i.id)} />
          </article>
        ))}
      </Group>

      {/* Recurrentes */}
      <Group title="Recurrentes" total={eur.format(recurringTotal)} empty="Activa “Se repite cada mes” al añadir un gasto." count={recurring.length}>
        {recurring.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <ItemBody
              title={i.name}
              onEdit={() => openEdit({ type: "expense", item: i, fallbackDate: iso(i.next.date) })}
              meta={
                <span className={i.next.days <= 3 ? "font-medium text-neg" : ""}>
                  Día {i.day} · {i.next.days === 0 ? "hoy" : `en ${i.next.days} d`}
                </span>
              }
            />
            <InlineAmount value={i.amount} onSave={(n) => saveAmount(i, n)} />
            <EditButton onClick={() => openEdit({ type: "expense", item: i, fallbackDate: iso(i.next.date) })} />
            <DeleteButton onClick={() => removeExpense(i.id)} />
          </article>
        ))}
      </Group>

      {/* Puntuales */}
      <Group title="Puntuales" total={eur.format(oneOff.reduce((s, i) => s + i.amount, 0))} empty="Aún no hay gastos puntuales." count={oneOff.length}>
        {oneOff.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <ItemBody
              title={i.name}
              onEdit={() => openEdit({ type: "expense", item: i, fallbackDate: iso(today) })}
              meta={fmtIso(i.spentOn ?? iso(today))}
            />
            <InlineAmount value={i.amount} onSave={(n) => saveAmount(i, n)} />
            <EditButton onClick={() => openEdit({ type: "expense", item: i, fallbackDate: iso(today) })} />
            <DeleteButton onClick={() => removeExpense(i.id)} />
          </article>
        ))}
      </Group>

      {/* Posibles */}
      <Group title="Posibles" total={eur.format(possibles.reduce((s, i) => s + i.amount, 0))} empty="Guarda aquí lo que quieres comprar y aún no." count={possibles.length}>
        {possibles.map((i) => (
          <article key={i.id} className={`item ${i.pending ? "opacity-60" : ""}`}>
            <ItemBody
              title={i.name}
              onEdit={() => openEdit({ type: "expense", item: i, fallbackDate: iso(today) })}
              meta="Pendiente de decidir"
            />
            <InlineAmount value={i.amount} onSave={(n) => saveAmount(i, n)} />
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
      {editing && (
        <EditItemDialog
          key={editing.item.id}
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          onDelete={deleteEditing}
        />
      )}
      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
          onClick={() => setShowLogin(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="card w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Inicia sesión para continuar</h2>
            <p className="mt-2 text-sm text-dim">
              Necesitas una cuenta para añadir, editar o borrar movimientos. Es gratis y tarda un
              minuto.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Link href="/login" className="btn">
                Iniciar sesión
              </Link>
              <Link href="/register" className="btn-ghost">
                Crear cuenta
              </Link>
              <button type="button" onClick={() => setShowLogin(false)} className="py-2 text-sm text-dim hover:text-fg">
                Seguir mirando la demo
              </button>
            </div>
          </div>
        </div>
      )}
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
    tone === "pos" ? "bg-pos/15 text-pos" : tone === "neg" ? "bg-neg/15 text-neg" : "bg-surface-3/60 text-fg";
  return (
    <div className="min-w-0 rounded-[18px] border border-line/15 bg-surface-2/40 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex size-7 items-center justify-center rounded-full ${iconTone}`}>
          {icon}
        </span>
        <dt className="text-xs font-medium text-dim">{label}</dt>
      </div>
      <dd className="truncate text-lg font-semibold">{value}</dd>
      {hint && <p className="truncate text-xs text-dim">{hint}</p>}
    </div>
  );
}

function ItemBody({
  title,
  meta,
  onEdit,
}: {
  title: string;
  meta: React.ReactNode;
  onEdit: () => void;
}) {
  return (
    <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left">
      <p className="truncate text-base font-semibold">{title}</p>
      <p className="truncate text-xs text-dim">{meta}</p>
    </button>
  );
}

function InlineAmount({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Cambiar importe"
        className="-mx-1.5 cursor-text rounded-[10px] px-1.5 text-lg font-semibold transition hover:bg-surface-3/50"
      >
        {eur.format(value)}
      </button>
    );
  }

  function commit(input: HTMLInputElement) {
    setEditing(false);
    const n = Math.round(Number(input.value.replace(",", ".")) * 100) / 100;
    if (n > 0 && n !== value) onSave(n);
  }

  return (
    <span className="flex items-center gap-1 text-lg font-semibold">
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        defaultValue={String(value).replace(".", ",")}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Nuevo importe en euros"
        className="w-24 rounded-[10px] border border-accent/70 bg-surface-2/60 px-2 py-0.5 text-right outline-none"
      />
      €
    </span>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-icon" aria-label="Editar" title="Editar">
      <Pencil className="size-3.5" />
    </button>
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
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
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
