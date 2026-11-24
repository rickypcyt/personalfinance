"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Check, LogOut, PiggyBank, Repeat, X } from "lucide-react";
import {
  addFixedExpense,
  addIncome as addIncomeAction,
  confirmPossibleExpense,
  deleteFixedExpense,
  createVault as createVaultAction,
  deleteIncome,
  deleteVault as deleteVaultAction,
  deleteVaultMovement,
  logout,
  moveVaultMoney,
  updateExpense,
  updateIncome,
} from "@/app/actions";
import { QuickAddExpense, type Kind } from "@/components/quick-add-expense";
import { QuickAddIncome } from "@/components/quick-add-income";
import { AddButton, AddExpenseDialog } from "@/components/add-expense-dialog";
import { EditItemDialog, type Editing } from "@/components/edit-item-dialog";
import { VaultsSection } from "@/components/vaults";

export type Expense = {
  id: string;
  name: string;
  amount: number;
  recurring: boolean;
  possible: boolean;
  day: number;
  spentOn: string | null;
  createdAt?: string;
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
  createdAt?: string;
  pending?: boolean;
};

export type Vault = {
  id: string;
  name: string;
  goal: number | null;
  balance: number;
  pending?: boolean;
};

// amount > 0: dinero destinado al vault; amount < 0: dinero retirado.
export type VaultMove = {
  id: string;
  vaultId: string;
  amount: number;
  note: string;
  movedOn: string;
  // Si viene de un ingreso enviado directamente al vault.
  incomeId?: string | null;
  pending?: boolean;
};

type State = { expenses: Expense[]; incomes: Income[]; vaults: Vault[]; vaultMoves: VaultMove[] };
type Op =
  | { type: "addExpense"; item: Expense }
  | { type: "addIncome"; item: Income }
  | { type: "removeExpense"; id: string }
  | { type: "removeIncome"; id: string }
  | { type: "confirm"; id: string; today: string; day: number }
  | { type: "updateExpense"; id: string; patch: Partial<Expense> }
  | { type: "updateIncome"; id: string; patch: Partial<Income> }
  | { type: "addVault"; item: Vault }
  | { type: "removeVault"; id: string }
  | { type: "vaultMove"; move: VaultMove }
  | { type: "removeVaultMove"; id: string };

function reduce(state: State, op: Op): State {
  switch (op.type) {
    case "addExpense":
      return { ...state, expenses: [op.item, ...state.expenses] };
    case "addIncome":
      return { ...state, incomes: [op.item, ...state.incomes] };
    case "removeExpense":
      return { ...state, expenses: state.expenses.filter((e) => e.id !== op.id) };
    case "removeIncome": {
      const linked = state.vaultMoves.filter((m) => m.incomeId === op.id);
      return {
        ...state,
        incomes: state.incomes.filter((i) => i.id !== op.id),
        vaults: state.vaults.map((v) => ({
          ...v,
          balance: v.balance - linked.filter((m) => m.vaultId === v.id).reduce((s, m) => s + m.amount, 0),
        })),
        vaultMoves: state.vaultMoves.filter((m) => m.incomeId !== op.id),
      };
    }
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
    case "addVault":
      return { ...state, vaults: [...state.vaults, op.item] };
    case "removeVault":
      return {
        ...state,
        vaults: state.vaults.filter((v) => v.id !== op.id),
        vaultMoves: state.vaultMoves.filter((m) => m.vaultId !== op.id),
      };
    case "vaultMove":
      return {
        ...state,
        vaults: state.vaults.map((v) =>
          v.id === op.move.vaultId ? { ...v, balance: v.balance + op.move.amount } : v,
        ),
        vaultMoves: [op.move, ...state.vaultMoves],
      };
    case "removeVaultMove": {
      const move = state.vaultMoves.find((m) => m.id === op.id);
      if (!move) return state;
      return {
        ...state,
        vaults: state.vaults.map((v) =>
          v.id === move.vaultId ? { ...v, balance: v.balance - move.amount } : v,
        ),
        vaultMoves: state.vaultMoves.filter((m) => m.id !== op.id),
      };
    }
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
  const [expenseKind, setExpenseKind] = useState<Kind>("expense");
  const [adding, setAdding] = useState<"recurring" | "possible" | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const { expenses: all, incomes, vaults, vaultMoves } = state;

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
        createdAt: new Date().toISOString(),
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
    const id = `tmp-${Date.now()}`;
    const description = String(data.get("description") ?? "").trim();
    const amountEur = currency === "USD" ? Math.round(amount * lastRate * 0.995 * 100) / 100 : amount;
    const receivedOn = String(data.get("date") ?? todayIso);
    apply({
      type: "addIncome",
      item: { id, description, amount, currency, rate: null, feePct: null, amountEur, receivedOn, createdAt: new Date().toISOString(), pending: true },
    });
    const vaultId = String(data.get("vaultId") ?? "");
    if (vaultId) {
      apply({
        type: "vaultMove",
        move: { id: `${id}-v`, vaultId, amount: amountEur, note: description, movedOn: receivedOn, incomeId: id, pending: true },
      });
    }
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

  async function createVault(data: FormData): Promise<{ error: string | null }> {
    if (demo) {
      setShowLogin(true);
      return { error: "Inicia sesión para guardar tus datos" };
    }
    const goal = String(data.get("goal") ?? "").trim();
    apply({
      type: "addVault",
      item: {
        id: `tmp-${Date.now()}`,
        name: String(data.get("name") ?? "").trim(),
        goal: goal ? Number(goal) : null,
        balance: 0,
        pending: true,
      },
    });
    return createVaultAction(data);
  }

  async function moveVault(
    vaultId: string,
    direction: "in" | "out",
    amount: number,
    note: string,
  ): Promise<{ error: string | null }> {
    if (demo) {
      setShowLogin(true);
      return { error: "Inicia sesión para guardar tus datos" };
    }
    apply({
      type: "vaultMove",
      move: {
        id: `tmp-${Date.now()}`,
        vaultId,
        amount: direction === "in" ? amount : -amount,
        note,
        movedOn: todayIso,
        pending: true,
      },
    });
    const fd = new FormData();
    fd.set("vaultId", vaultId);
    fd.set("amount", String(amount));
    fd.set("direction", direction);
    fd.set("note", note);
    fd.set("date", todayIso);
    return moveVaultMoney(fd);
  }

  function removeVault(id: string) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    startTransition(async () => {
      apply({ type: "removeVault", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteVaultAction(fd);
    });
  }

  function removeVaultMove(id: string) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    startTransition(async () => {
      apply({ type: "removeVaultMove", id });
      const fd = new FormData();
      fd.set("id", id);
      await deleteVaultMovement(fd);
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

  // Cambia solo el importe de un ingreso (en su moneda original) desde la lista.
  function saveIncomeAmount(item: Income, amount: number) {
    if (demo) {
      setShowLogin(true);
      return;
    }
    const current = item.currency === "USD" ? item.amount : item.amountEur;
    if (!(amount > 0) || amount === current) return;
    const rate = item.rate ?? incomes.find((i) => i.currency === "USD" && i.rate)?.rate ?? 0.9;
    const fee = item.feePct ?? 0.5;
    const fd = new FormData();
    fd.set("description", item.description);
    fd.set("amount", String(amount));
    fd.set("currency", item.currency);
    fd.set("date", item.receivedOn);
    startTransition(async () => {
      apply({
        type: "updateIncome",
        id: item.id,
        patch: {
          amount,
          amountEur:
            item.currency === "USD" ? Math.round(amount * rate * (1 - fee / 100) * 100) / 100 : amount,
        },
      });
      await updateIncome(item.id, fd);
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
  // El dinero destinado a vaults este mes sale del balance disponible (y lo retirado vuelve).
  const vaultNetMonth = vaultMoves
    .filter((m) => m.movedOn.startsWith(monthKey))
    .reduce((s, m) => s + m.amount, 0);
  const vaultsTotal = vaults.reduce((s, v) => s + v.balance, 0);
  const balance = incomeMonth - expensesMonth - vaultNetMonth;
  const spentPct = incomeMonth > 0 ? Math.round((expensesMonth / incomeMonth) * 100) : null;

  return (
    <div className="w-full">
      {demo && (
        <p className="mb-5 glass rounded-[20px] px-4 py-3 text-sm text-dim">
          Esto es una <span className="font-semibold text-fg">demo con datos de ejemplo</span>. Inicia
          sesión o crea una cuenta para guardar los tuyos.
        </p>
      )}

      {/* Resumen del mes + sesión en la esquina superior derecha */}
      <div className="sticky top-3 z-30 flex flex-col-reverse gap-4 sm:flex-row sm:items-start">
      <section className="card relative flex min-w-0 flex-1 !bg-surface !backdrop-blur-none items-center gap-x-6 gap-y-2 overflow-hidden !rounded-full !px-6 !py-2.5 max-sm:flex-wrap max-sm:!rounded-[24px]">
        <div className="min-w-0 shrink-0">
          <p className="eyebrow capitalize leading-none">{monthName}</p>
          <p
            className={`truncate text-2xl font-semibold leading-tight tracking-tight ${balance < 0 ? "text-neg" : ""}`}
            title={spentPct !== null ? `Has gastado el ${spentPct} % de tus ingresos` : undefined}
          >
            {eur.format(balance)}
          </p>
        </div>
        <div className="ml-auto grid min-w-0 grid-cols-3 divide-x divide-line/15 text-right max-sm:w-full">
          <MiniStat
            icon={<ArrowDownLeft className="size-3" />}
            label="Ingresos"
            value={`+${eur.format(incomeMonth)}`}
            tone="text-pos"
            title="Ingresos de este mes"
          />
          <MiniStat
            icon={<ArrowUpRight className="size-3" />}
            label="Gastos"
            value={`−${eur.format(expensesMonth)}`}
            tone="text-neg"
            title={`${eur.format(recurringTotal)} fijos · ${eur.format(oneOffMonth)} puntuales`}
          />
          <MiniStat
            icon={<PiggyBank className="size-3" />}
            label="Vaults"
            value={eur.format(vaultsTotal)}
            tone="text-accent"
            title={`${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}`}
          />
        </div>
      </section>
        {demo ? (
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
            <Link href="/login" className="btn-ghost">
              Iniciar sesión
            </Link>
            <Link href="/register" className="btn !h-10 !px-5 !text-sm">
              Crear cuenta
            </Link>
          </div>
        ) : (
          <form action={logout} className="fixed bottom-5 right-5 z-40">
            <button
              type="submit"
              className="btn-ghost !h-12 !px-5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.8)] backdrop-blur-2xl"
              aria-label="Salir"
              title="Cerrar sesión"
            >
              <LogOut className="size-4" /> Salir
            </button>
          </form>
        )}
      </div>

      {/* Primera fila: añadir ingreso | añadir gasto (cuadrados) | historial */}
      <div className="mt-5 grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-[30rem_30rem_minmax(0,1fr)]">
        <section className="card flex aspect-square flex-col">
          <CardHeader icon={<ArrowDownLeft className="size-4" />} title="Añadir ingreso" tone="pos" />
          <div className="mt-4 flex flex-1 flex-col">
            <QuickAddIncome today={iso(today)} vaults={vaults} onAdd={addIncome} />
          </div>
        </section>
        <section className="card flex aspect-square flex-col">
<CardHeader icon={<ArrowUpRight className="size-4" />} title="Añadir gasto" tone="neg" />
          <div className="mt-4 flex flex-1 flex-col">
            <QuickAddExpense today={iso(today)} kind={expenseKind} onKindChange={setExpenseKind} onAdd={addExpense} />
          </div>
        </section>
        <div className="relative md:col-span-2 2xl:col-span-1 2xl:self-stretch">
        <HistoryCard
          className="2xl:absolute 2xl:inset-0"
          incomes={incomes}
          oneOff={oneOff}
          todayIso={todayIso}
          onEditIncome={(i) => openEdit({ type: "income", item: i })}
          onEditExpense={(e, fallbackDate) => openEdit({ type: "expense", item: e, fallbackDate })}
          onRemoveIncome={removeIncome}
          onRemoveExpense={removeExpense}
          onIncomeAmount={saveIncomeAmount}
          onExpenseAmount={saveAmount}
        />
        </div>
      </div>

      {/* Recurrentes | Posibles | Vaults */}
      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <RecurringCard
          recurring={recurring}
          onAdd={() => (demo ? setShowLogin(true) : setAdding("recurring"))}
          onEdit={(e, fallbackDate) => openEdit({ type: "expense", item: e, fallbackDate })}
          onRemove={removeExpense}
          onAmount={saveAmount}
        />
        <PossiblesCard
          possibles={possibles}
          onAdd={() => (demo ? setShowLogin(true) : setAdding("possible"))}
          onEdit={(e) => openEdit({ type: "expense", item: e, fallbackDate: todayIso })}
          onRemove={removeExpense}
          onAmount={saveAmount}
          onConfirm={confirm}
        />
        <VaultsSection
          className="md:col-span-2 xl:col-span-1"
          vaults={vaults}
          moves={vaultMoves}
          onCreate={createVault}
          onMove={moveVault}
          onDeleteVault={removeVault}
          onDeleteMove={removeVaultMove}
        />
      </div>

      {adding && (
        <AddExpenseDialog kind={adding} today={todayIso} onAdd={addExpense} onClose={() => setAdding(null)} />
      )}

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
            className="card w-full max-w-sm !bg-surface !backdrop-blur-none"
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
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="py-2 text-sm text-dim hover:text-fg"
              >
                Seguir mirando la demo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Piezas de layout ---------- */

function MiniStat({
  icon,
  label,
  value,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
  title: string;
}) {
  return (
    <div className="min-w-0 px-4 last:pr-0 max-sm:px-2" title={title}>
      <p className="eyebrow flex items-center justify-end gap-1 leading-none">
        {icon} {label}
      </p>
      <p className={`truncate text-base font-semibold leading-tight tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  hint,
  right,
  tone,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  tone?: "pos" | "neg";
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        className={`flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight ${
          tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : ""
        }`}
      >
        {icon && <span className={`shrink-0 ${tone ? "" : "text-dim"}`}>{icon}</span>}
        <span className="truncate">{title}</span>
        {hint && <span className="shrink-0 text-sm font-normal text-dim">· {hint}</span>}
      </h2>
      {right}
    </div>
  );
}

const ROW = "flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-2/40";

function RecurringCard({
  recurring,
  onAdd,
  onEdit,
  onRemove,
  onAmount,
}: {
  recurring: Recurring[];
  onAdd: () => void;
  onEdit: (e: Expense, fallbackDate: string) => void;
  onRemove: (id: string) => void;
  onAmount: (e: Expense, n: number) => void;
}) {
  const total = recurring.reduce((s, i) => s + i.amount, 0);
  return (
    <section className="card">
      <CardHeader
        icon={<Repeat className="size-4" />}
        title="Recurrentes"
        hint="cada mes"
        right={
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-base font-semibold">{eur.format(total)}</span>
            <AddButton label="Nuevo recurrente" onClick={onAdd} />
          </div>
        }
      />
      {recurring.length === 0 ? (
        <p className="mt-3 text-sm text-dim">Elige “Recurrente” al añadir un gasto.</p>
      ) : (
        <div className="no-scrollbar -mx-2 mt-3 flex max-h-72 flex-col overflow-y-auto overscroll-contain">
          {recurring.map((i) => (
            <article key={i.id} className={`${ROW} ${i.pending ? "opacity-60" : ""}`}>
              <ItemBody
                title={i.name}
                onEdit={() => onEdit(i, iso(i.next.date))}
                meta={
                  <span className={i.next.days <= 3 ? "font-medium text-neg" : ""}>
                    Día {i.day} · {i.next.days === 0 ? "hoy" : `en ${i.next.days} d`}
                  </span>
                }
              />
              <InlineAmount value={i.amount} onSave={(n) => onAmount(i, n)} className="!text-base" />
              <DeleteButton onClick={() => onRemove(i.id)} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PossiblesCard({
  possibles,
  onAdd,
  onEdit,
  onRemove,
  onAmount,
  onConfirm,
}: {
  possibles: Expense[];
  onAdd: () => void;
  onEdit: (e: Expense) => void;
  onRemove: (id: string) => void;
  onAmount: (e: Expense, n: number) => void;
  onConfirm: (id: string) => void;
}) {
  const total = possibles.reduce((s, i) => s + i.amount, 0);
  return (
    <section className="card">
      <CardHeader
        icon={<CalendarClock className="size-4" />}
        title="Posibles"
        hint="sin decidir"
        right={
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-base font-semibold text-dim">{eur.format(total)}</span>
            <AddButton label="Nuevo posible" onClick={onAdd} />
          </div>
        }
      />
      {possibles.length === 0 ? (
        <p className="mt-3 text-sm text-dim">Guarda aquí lo que quieres comprar y aún no compras.</p>
      ) : (
        <div className="no-scrollbar -mx-2 mt-3 flex max-h-72 flex-col overflow-y-auto overscroll-contain">
          {possibles.map((i) => (
            <article key={i.id} className={`${ROW} ${i.pending ? "opacity-60" : ""}`}>
              <ItemBody title={i.name} onEdit={() => onEdit(i)} meta="Pendiente de decidir" />
              <InlineAmount value={i.amount} onSave={(n) => onAmount(i, n)} className="!text-base" />
              <div className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => onConfirm(i.id)}
                  className="btn-icon hover:!bg-pos/15 hover:!text-pos"
                  aria-label="Confirmar compra"
                  title="Confirmar: ya lo compré"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(i.id)}
                  className="btn-icon hover:!bg-neg/15 hover:!text-neg"
                  aria-label="Rechazar"
                  title="Rechazar: no lo compro"
                >
                  <X className="size-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Filas e importes ---------- */

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

function InlineAmount({
  value,
  onSave,
  display,
  symbol = "€",
  className = "",
  title = "Cambiar importe",
}: {
  value: number;
  onSave: (n: number) => void;
  display?: string; // texto mostrado si no es el propio importe (p. ej. "+12,00 €")
  symbol?: string;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={title}
        className={`-mx-1.5 shrink-0 cursor-text rounded-[10px] px-1.5 text-lg font-semibold transition hover:bg-surface-3/50 ${className}`}
      >
        {display ?? eur.format(value)}
      </button>
    );
  }

  function commit(input: HTMLInputElement) {
    setEditing(false);
    const n = Math.round(Number(input.value.replace(",", ".")) * 100) / 100;
    if (n > 0 && n !== value) onSave(n);
  }

  return (
    <span className={`flex shrink-0 items-center gap-1 text-lg font-semibold ${className}`}>
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
        aria-label={`Nuevo importe en ${symbol === "$" ? "dólares" : "euros"}`}
        className="w-24 rounded-[10px] border border-accent/70 bg-surface-2/60 px-2 py-0.5 text-right text-fg outline-none"
      />
      {symbol}
    </span>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-icon" aria-label="Eliminar">
      <X className="size-4" />
    </button>
  );
}

/* ---------- Historial ---------- */

type Move = {
  id: string;
  kind: "income" | "expense";
  title: string;
  date: string;
  created: string;
  amount: number;
  pending?: boolean;
  extra?: string;
  income?: Income;
  expense?: Expense;
};
type Recurring = Expense & { next: { date: Date; days: number } };

// Semanas de lunes a domingo.
function weekStart(s: string) {
  const d = fromIso(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

function weekLabel(start: string, thisWeek: string) {
  if (start === thisWeek) return "Esta semana";
  const prev = fromIso(thisWeek);
  prev.setDate(prev.getDate() - 7);
  if (start === iso(prev)) return "Semana pasada";
  const s = fromIso(start);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}

function groupByWeek(moves: Move[]) {
  const weeks = new Map<string, Move[]>();
  for (const m of [...moves].sort((a, b) => (b.created || "￿").localeCompare(a.created || "￿"))) {
    const k = weekStart(m.date);
    const list = weeks.get(k);
    if (list) list.push(m);
    else weeks.set(k, [m]);
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([start, list]) => ({
      start,
      list,
      in: list.filter((m) => m.kind === "income").reduce((s, m) => s + m.amount, 0),
      out: list.filter((m) => m.kind === "expense").reduce((s, m) => s + m.amount, 0),
    }));
}

type Tab = "all" | "expense" | "income";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "expense", label: "Gastos" },
  { value: "income", label: "Ingresos" },
];
const WEEKS_PAGE = 4;

function HistoryCard({
  className = "",
  incomes,
  oneOff,
  todayIso,
  onEditIncome,
  onEditExpense,
  onRemoveIncome,
  onRemoveExpense,
  onIncomeAmount,
  onExpenseAmount,
}: {
  className?: string;
  incomes: Income[];
  oneOff: Expense[];
  todayIso: string;
  onEditIncome: (i: Income) => void;
  onEditExpense: (e: Expense, fallbackDate: string) => void;
  onRemoveIncome: (id: string) => void;
  onRemoveExpense: (id: string) => void;
  onIncomeAmount: (i: Income, n: number) => void;
  onExpenseAmount: (e: Expense, n: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [shown, setShown] = useState(WEEKS_PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  // Lo más reciente va arriba: al cambiar de pestaña, volver al principio.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const moves: Move[] = [
    ...incomes.map<Move>((i) => ({
      id: i.id,
      kind: "income",
      title: i.description,
      date: i.receivedOn,
      created: i.createdAt ?? "",
      amount: i.amountEur,
      pending: i.pending,
      extra: i.currency === "USD" ? `$${i.amount.toFixed(2)}` : undefined,
      income: i,
    })),
    ...oneOff.map<Move>((e) => ({
      id: e.id,
      kind: "expense",
      title: e.name,
      date: e.spentOn ?? todayIso,
      created: e.createdAt ?? "",
      amount: e.amount,
      pending: e.pending,
      expense: e,
    })),
  ];
  const weeks = groupByWeek(tab === "all" ? moves : moves.filter((m) => m.kind === tab));
  const thisWeek = weekStart(todayIso);

  return (
    <section className={`card flex max-h-[40rem] min-h-0 flex-col 2xl:max-h-none ${className}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Historial</h2>
        <div className="seg w-full grid-cols-3 sm:w-72">
          {TABS.map((t) => (
            <label key={t.value}>
              <input
                type="radio"
                name="history-tab"
                value={t.value}
                checked={tab === t.value}
                onChange={() => setTab(t.value)}
                className="sr-only"
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {weeks.length === 0 ? (
        <p className="py-16 text-center text-base text-dim">
          {tab === "income"
            ? "Aún no hay ingresos."
            : tab === "expense"
              ? "Aún no hay gastos puntuales."
              : "Aún no hay movimientos."}
        </p>
      ) : (
        <div
          ref={listRef}
          className="mt-5 flex min-h-0 flex-1 flex-col divide-y divide-line/15 no-scrollbar overflow-y-auto overscroll-contain"
        >
          {weeks.slice(0, shown).map((w) => (
            <div key={w.start} className="py-5 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-baseline justify-between gap-4">
                <h3 className="text-sm font-semibold">
                  {weekLabel(w.start, thisWeek)}{" "}
                  <span className="font-normal text-dim">
                    · {w.list.length} {w.list.length === 1 ? "movimiento" : "movimientos"}
                  </span>
                </h3>
                <span className="flex shrink-0 gap-3 text-sm font-semibold">
                  {w.in > 0 && <span className="text-pos">+{eur.format(w.in)}</span>}
                  {w.out > 0 && <span className="text-neg">−{eur.format(w.out)}</span>}
                </span>
              </div>
              <div className="-mx-2 flex flex-col">
                {w.list.map((m) =>
                  m.kind === "income" ? (
                    <MoveRow
                      key={m.id}
                      move={m}
                      onEdit={() => m.income && onEditIncome(m.income)}
                      onRemove={() => onRemoveIncome(m.id)}
                      onAmount={(n) => m.income && onIncomeAmount(m.income, n)}
                    />
                  ) : (
                    <MoveRow
                      key={m.id}
                      move={m}
                      onEdit={() => m.expense && onEditExpense(m.expense, m.date)}
                      onRemove={() => onRemoveExpense(m.id)}
                      onAmount={(n) => m.expense && onExpenseAmount(m.expense, n)}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
          {weeks.length > shown && (
            <button type="button" onClick={() => setShown((s) => s + WEEKS_PAGE)} className="btn-ghost mt-5 w-full shrink-0">
              Mostrar semanas anteriores
            </button>
          )}
        </div>
      )}

    </section>
  );
}

function MoveRow({
  move: m,
  onEdit,
  onRemove,
  onAmount,
}: {
  move: Move;
  onEdit: () => void;
  onRemove: () => void;
  onAmount: (n: number) => void;
}) {
  const income = m.kind === "income";
  const date = fromIso(m.date).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return (
    <article className={`${ROW} ${m.pending ? "opacity-60" : ""}`}>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          income ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"
        }`}
      >
        {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
      </span>
      <ItemBody title={m.title} onEdit={onEdit} meta={m.extra ? `${date} · ${m.extra}` : date} />
      {income ? (
        <InlineAmount
          value={m.income?.currency === "USD" ? m.income.amount : m.amount}
          display={`+${eur.format(m.amount)}`}
          symbol={m.income?.currency === "USD" ? "$" : "€"}
          className="text-pos"
          title={m.income?.currency === "USD" ? "Cambiar importe en dólares" : "Cambiar importe"}
          onSave={onAmount}
        />
      ) : (
        <InlineAmount value={m.amount} display={`−${eur.format(m.amount)}`} onSave={onAmount} />
      )}
      <DeleteButton onClick={onRemove} />
    </article>
  );
}
