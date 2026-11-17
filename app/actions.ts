"use server";

import bcrypt from "bcryptjs";
import { sql } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

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
