import { existsSync, rmSync } from "node:fs";
import { loadLocalEnvironment } from "../src/server/config/env.ts";
import { createDatabase, resolveDatabaseFilePath } from "../src/server/db/database.ts";
import { seedDemoData } from "../src/server/db/seed.ts";

loadLocalEnvironment();
if (process.env.TURSO_DATABASE_URL) {
  throw new Error("db:reset remove apenas o SQLite local. Remova temporariamente as variáveis TURSO_* para evitar apagar ou reseedar o banco remoto por engano.");
}
const location = process.env.DB_PATH ?? "./data/nexo-assist.sqlite";
if (location !== ":memory:") {
  const absolutePath = resolveDatabaseFilePath(location);
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${absolutePath}${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
}
const db = await createDatabase(location);
await seedDemoData(db);
await db.close();
console.log("Banco de demonstração recriado.");
