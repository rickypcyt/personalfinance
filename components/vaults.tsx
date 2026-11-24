"use client";

import { useRef, useState, useTransition } from "react";
import { Minus, PiggyBank, Plus, X } from "lucide-react";
import { CardHeader, type Vault, type VaultMove } from "@/components/dashboard";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const MOVES_PAGE = 8;

type Result = { error: string | null };

export function VaultsSection({
  className = "",
  vaults,
  moves,
  onCreate,
  onMove,
  onDeleteVault,
  onDeleteMove,
}: {
  className?: string;
  vaults: Vault[];
  moves: VaultMove[];
  onCreate: (data: FormData) => Promise<Result>;
  onMove: (vaultId: string, direction: "in" | "out", amount: number, note: string) => Promise<Result>;
  onDeleteVault: (id: string) => void;
  onDeleteMove: (id: string) => void;
}) {
  const [shown, setShown] = useState(MOVES_PAGE);
  const [creating, setCreating] = useState(false);
  const total = vaults.reduce((s, v) => s + v.balance, 0);
  const byId = new Map(vaults.map((v) => [v.id, v]));

  return (
    <section className={`card flex flex-col ${className}`}>
      <CardHeader
        icon={<PiggyBank className="size-4" />}
        title="Vaults"
        hint={
          vaults.length === 0
            ? "separa dinero para algo concreto"
            : `${vaults.length} ${vaults.length === 1 ? "vault" : "vaults"}`
        }
        right={
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-base font-semibold">{eur.format(total)}</span>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-icon !size-10 bg-surface-2/60"
              aria-label="Nuevo vault"
              title="Nuevo vault"
            >
              <Plus className="size-6" />
            </button>
          </div>
        }
      />

      <div className="mt-4 flex flex-1 flex-col gap-5">
        {vaults.length > 0 && (
          <div className="no-scrollbar grid max-h-96 gap-5 overflow-y-auto overscroll-contain sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
            {vaults.map((v) => (
              <VaultTile key={v.id} vault={v} onMove={onMove} onDelete={() => onDeleteVault(v.id)} />
            ))}
          </div>
        )}

        {/* Movimientos de dinero */}
        <section className="flex-1 border-t border-line/15 pt-4">
          <CardHeader
            title="Movimientos"
            hint="vaults"
            right={<span className="text-sm text-dim">{moves.length}</span>}
          />

          {moves.length === 0 ? (
            <p className="py-4 text-center text-sm text-dim">
              Aquí verás cada vez que destines o retires dinero.
            </p>
          ) : (
            <div className="no-scrollbar -mx-2 mt-3 flex max-h-64 flex-col overflow-y-auto overscroll-contain">
              {moves.slice(0, shown).map((m) => {
              const vault = byId.get(m.vaultId);
              const deposit = m.amount > 0;
              const date = new Date(m.movedOn + "T00:00:00").toLocaleDateString("es-ES", {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
              return (
                <article
                  key={m.id}
                  className={`flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-2/40 ${
                    m.pending ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                      deposit ? "bg-accent/15 text-accent" : "bg-surface-3/60 text-fg"
                    }`}
                  >
                    {deposit ? <Plus className="size-4" /> : <Minus className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{vault?.name ?? "Vault"}</p>
                    <p className="truncate text-xs text-dim">
                      {date}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <span className={`text-lg font-semibold ${deposit ? "text-accent" : ""}`}>
                    {deposit ? "+" : "−"}
                    {eur.format(Math.abs(m.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteMove(m.id)}
                    className="btn-icon"
                    aria-label="Eliminar movimiento"
                  >
                    <X className="size-4" />
                  </button>
                </article>
              );
              })}
            </div>
          )}
          {moves.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + MOVES_PAGE)}
              className="btn-ghost mt-3 w-full"
            >
              Ver más
            </button>
          )}
        </section>
      </div>

      {creating && <NewVaultDialog onCreate={onCreate} onClose={() => setCreating(false)} />}
    </section>
  );
}

function VaultTile({
  vault,
  onMove,
  onDelete,
}: {
  vault: Vault;
  onMove: (vaultId: string, direction: "in" | "out", amount: number, note: string) => Promise<Result>;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const pct = vault.goal ? Math.min(100, (vault.balance / vault.goal) * 100) : 0;

  function submit(direction: "in" | "out") {
    const amount = Math.round(Number((amountRef.current?.value ?? "").replace(",", ".")) * 100) / 100;
    if (!(amount > 0)) {
      setError("Escribe un importe");
      amountRef.current?.focus();
      return;
    }
    if (direction === "out" && amount > vault.balance) {
      setError("No hay tanto en este vault");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await onMove(vault.id, direction, amount, "");
      setError(res.error);
      if (!res.error) {
        if (amountRef.current) amountRef.current.value = "";
      }
    });
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-[18px] border border-line/15 bg-surface-2/40 p-3 ${
        vault.pending ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{vault.name}</h3>
        <p className="shrink-0 text-base font-semibold tracking-tight">{eur.format(vault.balance)}</p>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Eliminar el vault “${vault.name}” y todos sus movimientos?`)) onDelete();
          }}
          className="btn-icon -mr-1 !size-6"
          aria-label="Eliminar vault"
          title="Eliminar vault"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {vault.goal ? (
        <div
          className="h-1 overflow-hidden rounded-full bg-surface-3/50"
          title={`${Math.round(pct)} % de ${eur.format(vault.goal)}`}
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <input
          ref={amountRef}
          type="text"
          inputMode="decimal"
          placeholder="Importe €"
          aria-label={`Importe para ${vault.name}`}
          className="input !h-8 min-w-0 flex-1 !text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("in")}
          className="btn !h-8 !px-3 !text-sm"
          title="Destinar al vault"
        >
          <Plus className="size-4" /> Destinar
        </button>
        <button
          type="button"
          disabled={pending || vault.balance <= 0}
          onClick={() => submit("out")}
          className="btn-icon !size-8 bg-surface-2/60"
          aria-label="Retirar"
          title="Retirar del vault"
        >
          <Minus className="size-4" />
        </button>
      </div>
      {error && <p className="text-xs font-medium text-neg">{error}</p>}
    </div>
  );
}

function NewVaultDialog({
  onCreate,
  onClose,
}: {
  onCreate: (data: FormData) => Promise<Result>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await onCreate(data);
      setError(res.error);
      if (!res.error) onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md"
      onClick={onClose}
    >
    <form
      ref={formRef}
      onSubmit={onSubmit}
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo vault"
      onClick={(e) => e.stopPropagation()}
      className="card flex w-full max-w-sm flex-col gap-2 !bg-surface !backdrop-blur-none"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">Nuevo vault</h3>
        <button type="button" onClick={onClose} className="btn-icon -mr-1.5 -mt-1.5" aria-label="Cerrar">
          <X className="size-4" />
        </button>
      </div>
      <p className="text-xs text-dim">Ponle el nombre que quieras: viaje, coche, fondo de emergencia…</p>
      <input
        name="name"
        required
        autoFocus
        maxLength={40}
        placeholder="Nombre"
        aria-label="Nombre"
        className="input !h-10"
      />
      <input
        name="goal"
        type="number"
        step="0.01"
        min="0.01"
        placeholder="Meta € (opcional)"
        aria-label="Meta"
        className="input !h-10"
      />
      {error && <p className="text-xs font-medium text-neg">{error}</p>}
      <button type="submit" disabled={pending} className="btn mt-2">
        <Plus className="size-4" /> {pending ? "Creando…" : "Crear vault"}
      </button>
    </form>
    </div>
  );
}
