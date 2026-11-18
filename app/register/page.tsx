import { register, googleLogin } from "../actions";
import Link from "next/link";

const errors: Record<string, string> = {
  missing: "Completa todos los campos.",
  short: "La contraseña debe tener al menos 8 caracteres.",
  exists: "Ya existe una cuenta con ese email.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-10">
      <main className="w-full max-w-sm">
        <p className="eyebrow mb-2">Finanzas personales</p>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Crear cuenta</h1>
        {error && (
          <p className="mb-5 rounded-2xl bg-neg/15 px-4 py-3 text-base font-medium text-neg">
            {errors[error] ?? "Ha ocurrido un error."}
          </p>
        )}
        <form action={googleLogin} className="mb-6">
          <button type="submit" className="btn-ghost w-full">
            <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
            </svg>
            Continuar con Google
          </button>
        </form>
        <div className="mb-6 flex items-center gap-4 text-sm text-dim">
          <span className="h-px flex-1 bg-line/20" />
          o con email
          <span className="h-px flex-1 bg-line/20" />
        </div>
        <form action={register} className="flex flex-col gap-4">
          <label className="field">
            Nombre
            <input name="name" type="text" className="input" />
          </label>
          <label className="field">
            Email
            <input name="email" type="email" required className="input" />
          </label>
          <label className="field">
            Contraseña
            <input name="password" type="password" required minLength={8} className="input" />
          </label>
          <button type="submit" className="btn mt-2">Crear cuenta</button>
        </form>
        <p className="mt-6 text-center text-base text-dim">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-fg underline underline-offset-4">
            Inicia sesión
          </Link>
        </p>
      </main>
    </div>
  );
}
