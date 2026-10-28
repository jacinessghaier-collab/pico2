import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Resolve `@/` to src for node:test. Vite already does this in the app. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const ts = new URL(`../src/${rel}.ts`, import.meta.url);
    const tsx = new URL(`../src/${rel}.tsx`, import.meta.url);
    const target = existsSync(fileURLToPath(ts))
      ? ts
      : existsSync(fileURLToPath(tsx))
        ? tsx
        : new URL(`../src/${rel}`, import.meta.url);
    return nextResolve(target.href, context);
  }
  return nextResolve(specifier, context);
}
