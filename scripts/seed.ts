import { loadLocalEnvironment } from "../src/server/config/env.ts";
import { createDatabase, closeDatabase } from "../src/server/db/database.ts";
import { seedDemoData } from "../src/server/db/seed.ts";

loadLocalEnvironment();
const db = createDatabase();
seedDemoData(db);
db.close();
closeDatabase();
console.log("Banco Nexo Assist inicializado e dados de demonstração carregados.");
