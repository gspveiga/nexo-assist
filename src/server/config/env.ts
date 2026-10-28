import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads the same optional local env files for CLI scripts that Next loads for the app. */
export function loadLocalEnvironment(): void {
  for (const file of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
