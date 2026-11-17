"use server";

import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { auth, signIn, signOut } from "@/auth";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { usdToEur } from "@/lib/fx";

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

  await sql`
    INSERT INTO incomes (user_id, description, amount, currency, rate, fee_pct, amount_eur, received_on)
    VALUES (${session.user.id}, ${description}, ${amount}, ${currency}, ${rate}, ${feePct}, ${amountEur}, ${date})
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteIncome(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await sql`
    DELETE FROM incomes
    WHERE id = ${formData.get("id") as string} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateExpenseDate(id: string, date: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!ISO_DATE.test(date)) return { error: "Fecha no válida" };

  await sql`
    UPDATE fixed_expenses
    SET spent_on = ${date}, charge_day = ${Number(date.slice(8, 10))}
    WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateIncomeDate(id: string, date: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!ISO_DATE.test(date)) return { error: "Fecha no válida" };

  const rows = await sql`
    SELECT amount, currency FROM incomes WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  if (rows.length === 0) return { error: "No encontrado" };

  if (rows[0].currency === "USD") {
    try {
      const fx = await usdToEur(date);
      const eurAmount = Math.round(Number(rows[0].amount) * fx.effectiveRate * 100) / 100;
      await sql`
        UPDATE incomes
        SET received_on = ${date}, rate = ${fx.rate}, fee_pct = ${fx.feePct}, amount_eur = ${eurAmount}
        WHERE id = ${id} AND user_id = ${session.user.id}
      `;
    } catch {
      return { error: "No se pudo obtener el tipo de cambio." };
    }
  } else {
    await sql`
      UPDATE incomes SET received_on = ${date}
      WHERE id = ${id} AND user_id = ${session.user.id}
    `;
  }
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
