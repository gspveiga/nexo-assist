import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads the same optional local env files for CLI scripts that Next loads for the app (.env.local takes precedence over .env). */
export function loadLocalEnvironment(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
