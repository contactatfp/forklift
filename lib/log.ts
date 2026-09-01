export function log(msg: string, extra?: Record<string, unknown>) {
  process.stderr.write(`${JSON.stringify({ msg, t: Date.now(), ...extra })}\n`);
}
