import { LogOut } from "lucide-react";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { logout } from "../actions";
import { Dashboard, type Expense, type Income } from "@/components/dashboard";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Home() {
  const session = await auth();
  const userId = session!.user.id;

  const [expenseRows, incomeRows] = await Promise.all([
    sql`
      SELECT id, name, amount, charge_day, recurring, status, to_char(spent_on, 'YYYY-MM-DD') AS spent_on
      FROM fixed_expenses WHERE user_id = ${userId}
    `,
    sql`
      SELECT id, description, amount, currency, rate, fee_pct, amount_eur,
             to_char(received_on, 'YYYY-MM-DD') AS received_on
      FROM incomes WHERE user_id = ${userId}
      ORDER BY received_on DESC, created_at DESC
    `,
  ]);

  const expenses: Expense[] = expenseRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    amount: Number(r.amount),
    recurring: r.recurring as boolean,
    possible: r.status === "possible",
    day: r.charge_day as number,
    spentOn: r.spent_on as string | null,
  }));
  const incomes: Income[] = incomeRows.map((r) => ({
    id: r.id as string,
    description: r.description as string,
    amount: Number(r.amount),
    currency: r.currency as string,
    rate: r.rate === null ? null : Number(r.rate),
    feePct: r.fee_pct === null ? null : Number(r.fee_pct),
    amountEur: Number(r.amount_eur),
    receivedOn: r.received_on as string,
  }));

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-12">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Finanzas personales</p>
          <h1 className="text-2xl font-bold tracking-tight">
            Hola, {session?.user?.name ?? session?.user?.email}
          </h1>
        </div>
        <form action={logout}>
          <button type="submit" className="btn-ghost">
            <LogOut className="size-4" /> Salir
          </button>
        </form>
      </header>

      <Dashboard initial={{ expenses, incomes }} todayIso={iso(new Date())} />
    </div>
  );
}
