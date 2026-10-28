import { existsSync, rmSync } from "node:fs";
import { loadLocalEnvironment } from "../src/server/config/env.ts";
import { createDatabase, resolveDatabaseFilePath } from "../src/server/db/database.ts";
import { seedDemoData } from "../src/server/db/seed.ts";

loadLocalEnvironment();
const location = process.env.DB_PATH ?? "./data/nexo-assist.sqlite";
if (location !== ":memory:") {
  const absolutePath = resolveDatabaseFilePath(location);
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${absolutePath}${suffix}`;
    if (existsSync(path)) rmSync(path);
  }
}
const db = createDatabase(location);
seedDemoData(db);
db.close();
console.log("Banco de demonstração recriado.");
