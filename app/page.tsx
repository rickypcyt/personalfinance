import { auth } from "@/auth";
import { logout } from "./actions";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 px-8 py-32 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Finanzas Personales
        </h1>
        {session?.user ? (
          <>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Hola, {session.user.name ?? session.user.email}
            </p>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Cerrar sesión
              </button>
            </form>
          </>
        ) : (
          <p className="text-zinc-600 dark:text-zinc-400">
            Inicia sesión para continuar.
          </p>
        )}
      </main>
    </div>
  );
}
