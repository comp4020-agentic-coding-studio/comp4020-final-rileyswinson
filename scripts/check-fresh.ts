// `pnpm check` runs the spec against whatever app is listening, and the spec
// draws on walls and leaves stickers to prove that they stay. Run against
// the app you're playing with, that's litter in your stalls. This starts a
// second copy of the app on a spare port with a throwaway data directory,
// runs the same spec against that, and clears up.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = String(18080 + Math.floor(Math.random() * 1000));
const data = mkdtempSync(join(tmpdir(), "stalls-"));
const app = spawn("node", ["server/server.ts"], {
  env: { ...process.env, PORT: port, DATA_DIR: data, RECONNECT_GRACE_MS: "300" },
  stdio: "ignore",
});

let status = 1;
try {
  // spec/global-setup.ts waits for the app to answer, so there's no waiting here
  const run = spawnSync("pnpm", ["check"], { env: { ...process.env, APP_URL: `http://localhost:${port}` }, stdio: "inherit" });
  status = run.status ?? 1;
} finally {
  app.kill();
  rmSync(data, { recursive: true, force: true });
}
process.exit(status);
