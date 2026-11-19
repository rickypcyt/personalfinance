"use server";

import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { auth, signIn, signOut } from "@/auth";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { usdToEur } from "@/lib/fx";
import { ensureVaultTables } from "@/lib/vaults";

export async function register(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) redirect("/register?error=missing");
  if (password.length < 8) redirect("/register?error=short");

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await sql`
      INSERT INTO users (email, name, password_hash)
      VALUES (${email}, ${name || null}, ${passwordHash})
    `;
  } catch {
    redirect("/register?error=exists");
  }

  await signIn("credentials", { email, password, redirectTo: "/" });
}

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=invalid");
    throw error;
  }
}

export async function googleLogin() {
  await signIn("google", { redirectTo: "/" });
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

export async function addFixedExpense(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  const amount = Number(formData.get("amount"));
  const date = (formData.get("date") as string) ?? "";
  const day = Number(date.slice(8, 10));
  const possible = formData.get("kind") === "possible";
  if (!name || !(amount > 0) || !Number.isInteger(day) || day < 1 || day > 31) return;

  await sql`
    INSERT INTO fixed_expenses (user_id, name, amount, charge_day, spent_on, recurring, status)
    VALUES (${session.user.id}, ${name}, ${amount}, ${day}, ${date},
      ${formData.get("kind") === "recurring"}, ${possible ? "possible" : "confirmed"})
  `;
  revalidatePath("/", "layout");
}

export async function deleteFixedExpense(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await sql`
    DELETE FROM fixed_expenses
    WHERE id = ${formData.get("id") as string} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
}

export async function addIncome(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const description = (formData.get("description") as string)?.trim();
  const amount = Number(formData.get("amount"));
  const currency = formData.get("currency") === "USD" ? "USD" : "EUR";
  const date = (formData.get("date") as string) ?? "";
  if (!description || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Datos no válidos" };
  }

  let rate: number | null = null;
  let feePct: number | null = null;
  let amountEur = amount;
  if (currency === "USD") {
    try {
      const fx = await usdToEur(date);
      rate = fx.rate;
      feePct = fx.feePct;
      amountEur = Math.round(amount * fx.effectiveRate * 100) / 100;
    } catch {
      return { error: "No se pudo obtener el tipo de cambio. Inténtalo de nuevo." };
    }
  }

  // Destino: cuenta principal (vacío) o un vault del usuario.
  const vaultId = ((formData.get("vaultId") as string) ?? "").trim();
  if (vaultId) {
    await ensureVaultTables();
    const owned = await sql`SELECT 1 FROM vaults WHERE id = ${vaultId} AND user_id = ${session.user.id}`;
    if (owned.length === 0) return { error: "Vault no encontrado" };
  }

  const inserted = await sql`
    INSERT INTO incomes (user_id, description, amount, currency, rate, fee_pct, amount_eur, received_on)
    VALUES (${session.user.id}, ${description}, ${amount}, ${currency}, ${rate}, ${feePct}, ${amountEur}, ${date})
    RETURNING id
  `;
  // El ingreso cuenta como ingreso, pero queda apartado en el vault (no suma al balance disponible).
  if (vaultId) {
    await sql`
      INSERT INTO vault_movements (user_id, vault_id, amount, note, moved_on, income_id)
      VALUES (${session.user.id}, ${vaultId}, ${amountEur}, ${description.slice(0, 80)}, ${date},
        ${String(inserted[0].id)})
    `;
  }
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteIncome(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const id = formData.get("id") as string;
  await ensureVaultTables();
  await sql`DELETE FROM vault_movements WHERE income_id = ${id} AND user_id = ${session.user.id}`;
  await sql`
    DELETE FROM incomes
    WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateExpense(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  const amount = Number(formData.get("amount"));
  const date = (formData.get("date") as string) ?? "";
  const kind = formData.get("kind");
  if (!name || !(amount > 0) || !ISO_DATE.test(date)) return { error: "Datos no válidos" };

  await sql`
    UPDATE fixed_expenses
    SET name = ${name}, amount = ${amount}, spent_on = ${date}, charge_day = ${Number(date.slice(8, 10))},
        recurring = ${kind === "recurring"}, status = ${kind === "possible" ? "possible" : "confirmed"}
    WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateIncome(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const description = (formData.get("description") as string)?.trim();
  const amount = Number(formData.get("amount"));
  const currency = formData.get("currency") === "USD" ? "USD" : "EUR";
  const date = (formData.get("date") as string) ?? "";
  if (!description || !(amount > 0) || !ISO_DATE.test(date)) return { error: "Datos no válidos" };

  const rows = await sql`
    SELECT currency, rate, fee_pct, to_char(received_on, 'YYYY-MM-DD') AS received_on
    FROM incomes WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  if (rows.length === 0) return { error: "No encontrado" };
  const prev = rows[0];

  let rate: number | null = null;
  let feePct: number | null = null;
  let amountEur = amount;
  if (currency === "USD") {
    // Reutiliza el cambio guardado si la fecha no ha cambiado; si no, lo vuelve a pedir.
    if (prev.currency === "USD" && prev.received_on === date && prev.rate !== null) {
      rate = Number(prev.rate);
      feePct = Number(prev.fee_pct ?? 0);
    } else {
      try {
        const fx = await usdToEur(date);
        rate = fx.rate;
        feePct = fx.feePct;
      } catch {
        return { error: "No se pudo obtener el tipo de cambio." };
      }
    }
    amountEur = Math.round(amount * rate * (1 - feePct / 100) * 100) / 100;
  }

  await sql`
    UPDATE incomes
    SET description = ${description}, amount = ${amount}, currency = ${currency},
        rate = ${rate}, fee_pct = ${feePct}, amount_eur = ${amountEur}, received_on = ${date}
    WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  // Mantiene sincronizado el movimiento del vault si el ingreso fue directo a uno.
  await ensureVaultTables();
  await sql`
    UPDATE vault_movements
    SET amount = ${amountEur}, note = ${description.slice(0, 80)}, moved_on = ${date}
    WHERE income_id = ${id} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function confirmPossibleExpense(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  await sql`
    UPDATE fixed_expenses
    SET status = 'confirmed', recurring = false, spent_on = ${today}, charge_day = ${now.getDate()}
    WHERE id = ${formData.get("id") as string} AND user_id = ${session.user.id} AND status = 'possible'
  `;
  revalidatePath("/", "layout");
}

// ---------- Vaults (ahorros) ----------

export async function createVault(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  const goalRaw = ((formData.get("goal") as string) ?? "").trim();
  const goal = goalRaw ? Number(goalRaw) : null;
  if (!name || name.length > 40) return { error: "Ponle un nombre al vault" };
  if (goal !== null && !(goal > 0)) return { error: "La meta debe ser mayor que 0" };

  await ensureVaultTables();
  await sql`
    INSERT INTO vaults (user_id, name, goal) VALUES (${session.user.id}, ${name}, ${goal})
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteVault(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureVaultTables();
  await sql`
    DELETE FROM vaults WHERE id = ${formData.get("id") as string} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
}

export async function moveVaultMoney(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const vaultId = formData.get("vaultId") as string;
  const amount = Math.round(Number(formData.get("amount")) * 100) / 100;
  const direction = formData.get("direction") === "out" ? "out" : "in";
  const note = ((formData.get("note") as string) ?? "").trim().slice(0, 80);
  const date = (formData.get("date") as string) ?? "";
  if (!(amount > 0) || !ISO_DATE.test(date)) return { error: "Datos no válidos" };

  await ensureVaultTables();
  const rows = await sql`
    SELECT v.id, COALESCE(SUM(m.amount), 0) AS balance
    FROM vaults v LEFT JOIN vault_movements m ON m.vault_id = v.id
    WHERE v.id = ${vaultId} AND v.user_id = ${session.user.id}
    GROUP BY v.id
  `;
  if (rows.length === 0) return { error: "Vault no encontrado" };
  if (direction === "out" && amount > Number(rows[0].balance)) {
    return { error: "No hay tanto dinero en este vault" };
  }

  await sql`
    INSERT INTO vault_movements (user_id, vault_id, amount, note, moved_on)
    VALUES (${session.user.id}, ${vaultId}, ${direction === "out" ? -amount : amount},
      ${note || null}, ${date})
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteVaultMovement(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await ensureVaultTables();
  // No permite borrar un ingreso si dejaría el vault en negativo.
  await sql`
    DELETE FROM vault_movements m
    WHERE m.id = ${formData.get("id") as string} AND m.user_id = ${session.user.id}
      AND (
        m.amount < 0 OR
        (SELECT COALESCE(SUM(x.amount), 0) FROM vault_movements x WHERE x.vault_id = m.vault_id) - m.amount >= 0
      )
  `;
  revalidatePath("/", "layout");
}
