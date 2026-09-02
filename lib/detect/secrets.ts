import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The secret scan runs inside the guest, before install, so a committed key
 * fails the bay without ever leaving the sandbox. Patterns live in the Python.
 */
export const SECRET_SCAN_SCRIPT = readFileSync(
  join(process.cwd(), "lib/detect/scan_secrets.py"),
  "utf8",
);
