import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const command = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(command, ["run", "test"], {
  cwd: path.resolve(__dirname),
  env: {
    ...process.env,
    E2E_WATCH: "1",
  },
  shell: true,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
