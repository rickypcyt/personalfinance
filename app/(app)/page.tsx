import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { Dashboard, type Expense, type Income, type Vault, type VaultMove } from "@/components/dashboard";
import { ensureVaultTables } from "@/lib/vaults";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Datos de ejemplo para quien aún no ha iniciado sesión.
function demoData(todayIso: string): {
  expenses: Expense[];
  incomes: Income[];
  vaults: Vault[];
  vaultMoves: VaultMove[];
} {
  const month = todayIso.slice(0, 7);
  const today = Number(todayIso.slice(8, 10));
  const day = (back: number) => `${month}-${String(Math.max(1, today - back)).padStart(2, "0")}`;

  const expenses: Expense[] = [
    { id: "d1", name: "Alquiler", amount: 550, recurring: true, possible: false, day: 1, spentOn: `${month}-01` },
    { id: "d2", name: "Netflix", amount: 12.99, recurring: true, possible: false, day: 12, spentOn: `${month}-12` },
    { id: "d3", name: "Gimnasio", amount: 29.9, recurring: true, possible: false, day: 20, spentOn: `${month}-20` },
    { id: "d4", name: "Spotify", amount: 10.99, recurring: true, possible: false, day: 25, spentOn: `${month}-25` },
    { id: "d5", name: "Corte de pelo", amount: 15, recurring: false, possible: false, day: 1, spentOn: day(1) },
    { id: "d6", name: "Helado", amount: 3.5, recurring: false, possible: false, day: 1, spentOn: day(2) },
    { id: "d7", name: "Compras ropa", amount: 49.9, recurring: false, possible: false, day: 1, spentOn: day(3) },
    { id: "d8", name: "Camisa", amount: 39.9, recurring: false, possible: true, day: 1, spentOn: day(0) },
    { id: "d9", name: "Zapatillas", amount: 89, recurring: false, possible: true, day: 1, spentOn: day(0) },
  ];
  const incomes: Income[] = [
    { id: "i1", description: "Nómina", amount: 1850, currency: "EUR", rate: null, feePct: null, amountEur: 1850, receivedOn: `${month}-01` },
    { id: "i2", description: "Freelance", amount: 220, currency: "USD", rate: 0.91, feePct: 0.5, amountEur: 199.2, receivedOn: day(2) },
  ];
  const vaults: Vault[] = [
    { id: "v1", name: "Viaje", goal: 1500, balance: 420 },
    { id: "v2", name: "Fondo de emergencia", goal: 3000, balance: 1250 },
  ];
  const vaultMoves: VaultMove[] = [
    { id: "m1", vaultId: "v1", amount: 100, note: "Ahorro del mes", movedOn: day(4) },
    { id: "m2", vaultId: "v2", amount: 250, note: "", movedOn: day(9) },
  ];
  return { expenses, incomes, vaults, vaultMoves };
}

export default async function Home() {
  const session = await auth();
  const todayIso = iso(new Date());

  if (!session?.user?.id) {
    return (
      <div className="w-full px-4 py-6 md:px-8 lg:px-12">
        <Dashboard initial={demoData(todayIso)} todayIso={todayIso} userName="" demo />
      </div>
    );
  }

  const userId = session.user.id;
  await ensureVaultTables();
  const [expenseRows, incomeRows, vaultRows, vaultMoveRows] = await Promise.all([
    sql`
      SELECT id, name, amount, charge_day, recurring, status, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, created_at
      FROM fixed_expenses WHERE user_id = ${userId}
      ORDER BY created_at, id
    `,
    sql`
      SELECT id, description, amount, currency, rate, fee_pct, amount_eur,
             to_char(received_on, 'YYYY-MM-DD') AS received_on, created_at
      FROM incomes WHERE user_id = ${userId}
      ORDER BY created_at, id
    `,
    sql`
      SELECT v.id, v.name, v.goal, COALESCE(SUM(m.amount), 0) AS balance
      FROM vaults v LEFT JOIN vault_movements m ON m.vault_id = v.id
      WHERE v.user_id = ${userId}
      GROUP BY v.id ORDER BY v.created_at
    `,
    sql`
      SELECT id, vault_id, amount, note, income_id, to_char(moved_on, 'YYYY-MM-DD') AS moved_on
      FROM vault_movements WHERE user_id = ${userId}
      ORDER BY moved_on DESC, created_at DESC LIMIT 200
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
    createdAt: new Date(r.created_at as string | Date).toISOString(),
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
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  }));

  const vaults: Vault[] = vaultRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    goal: r.goal === null ? null : Number(r.goal),
    balance: Number(r.balance),
  }));
  const vaultMoves: VaultMove[] = vaultMoveRows.map((r) => ({
    id: r.id as string,
    vaultId: r.vault_id as string,
    amount: Number(r.amount),
    note: (r.note as string | null) ?? "",
    movedOn: r.moved_on as string,
    incomeId: (r.income_id as string | null) ?? null,
  }));

  return (
    <div className="w-full px-4 py-6 md:px-8 lg:px-12">
      <Dashboard
        initial={{ expenses, incomes, vaults, vaultMoves }}
        todayIso={todayIso}
        userName={session.user.name ?? session.user.email ?? ""}
      />
    </div>
  );
}
