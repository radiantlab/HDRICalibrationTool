import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browser } from "@wdio/globals";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const applicationPath = path.resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "LumiLab.exe" : "LumiLab"
);
const watchMode = process.env.E2E_WATCH === "1";
const watchPauseMs = Number.parseInt(
  process.env.E2E_WATCH_PAUSE_MS ?? (watchMode ? "5000" : "0"),
  10
);

function createBuildEnv() {
  const env = { ...process.env };

  // WDIO loads this config via tsx, which leaks Node loader hooks into child
  // npm processes and breaks Next.js font resolution during the Tauri build.
  env.NODE_OPTIONS = undefined;
  env.npm_config_node_options = undefined;

  return env;
}

export const config = {
  afterTest: async () => {
    if (watchPauseMs > 0) {
      await browser.pause(watchPauseMs);
    }
  },
  beforeTest: async () => {
    if (watchMode) {
      await browser.pause(1000);
    }
  },
  capabilities: [
    {
      browserName: "tauri",
      maxInstances: 1,
      "tauri:options": {
        application: applicationPath,
      },
    },
  ],
  framework: "mocha",
  maxInstances: 1,
  mochaOpts: {
    // Comfortably longer than the pipeline's own wait, so a slow run fails
    // with "no outputs, the app was showing ..." rather than mocha killing the
    // test first and reporting only that time ran out.
    timeout: 900_000,
    ui: "bdd",
  },

  // Build the debug desktop binary, with the embedded WebDriver plugin
  // compiled in via the e2e-driver feature, before the session starts.
  onPrepare: () => {
    const build = spawnSync(
      "npm",
      [
        "run",
        "tauri",
        "build",
        "--",
        "--debug",
        "--no-bundle",
        "--features",
        "e2e-driver",
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: createBuildEnv(),
        shell: true,
        stdio: "inherit",
      }
    );

    if (build.status !== 0) {
      process.exit(build.status ?? 1);
    }
  },
  reporters: ["spec"],

  // @wdio/tauri-service launches and drives the app; the embedded provider
  // (the default) needs no external tauri-driver process, which is what
  // makes this work on macOS as well as Windows/Linux.
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: applicationPath,
        driverProvider: "embedded",
      },
    ],
  ],
  specs: ["./test/specs/**/*.ts"],
};
