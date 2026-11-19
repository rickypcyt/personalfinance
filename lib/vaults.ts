import { sql } from "@/lib/db";

// Crea las tablas de vaults la primera vez que se usan (idempotente).
// Un movimiento positivo es dinero destinado al vault; uno negativo, dinero retirado.
let ready: Promise<void> | null = null;

export function ensureVaultTables() {
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS vaults (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        name text NOT NULL,
        goal numeric(12, 2),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS vault_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        vault_id uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
        amount numeric(12, 2) NOT NULL,
        note text,
        moved_on date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    // Si el movimiento nace de un ingreso enviado directamente al vault, guarda su id.
    await sql`ALTER TABLE vault_movements ADD COLUMN IF NOT EXISTS income_id text`;
    await sql`CREATE INDEX IF NOT EXISTS vaults_user_idx ON vaults (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS vault_movements_vault_idx ON vault_movements (vault_id)`;
  })().catch((e) => {
    ready = null; // permite reintentar si falló
    throw e;
  });
  return ready;
}
