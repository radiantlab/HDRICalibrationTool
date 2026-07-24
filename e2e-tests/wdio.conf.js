import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browser } from "@wdio/globals";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const tauriDriverPath = path.resolve(
  os.homedir(),
  ".cargo",
  "bin",
  process.platform === "win32" ? "tauri-driver.exe" : "tauri-driver"
);
const applicationPath = path.resolve(
  __dirname,
  "..",
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32"
    ? "HDRICalibrationInterface.exe"
    : "HDRICalibrationInterface"
);
const watchMode = process.env.E2E_WATCH === "1";
const watchPauseMs = Number.parseInt(
  process.env.E2E_WATCH_PAUSE_MS ?? (watchMode ? "5000" : "0"),
  10
);

let tauriDriver;
let exit = false;

function createBuildEnv() {
  const env = { ...process.env };

  // WDIO loads this config via tsx, which leaks Node loader hooks into child
  // npm processes and breaks Next.js font resolution during the Tauri build.
  env.NODE_OPTIONS = undefined;
  env.npm_config_node_options = undefined;

  return env;
}

export const config = {
  afterSession: () => {
    closeTauriDriver();
  },

  afterTest: async () => {
    if (watchPauseMs > 0) {
      await browser.pause(watchPauseMs);
    }
  },

  // Start tauri-driver so WebdriverIO can proxy webdriver requests to Tauri.
  beforeSession: () => {
    tauriDriver = spawn(tauriDriverPath, [], {
      stdio: [null, process.stdout, process.stderr],
    });

    tauriDriver.on("error", (error) => {
      console.error(
        `tauri-driver failed to start from ${tauriDriverPath}. Install it with "cargo install tauri-driver --locked".`
      );
      console.error(error);
      process.exit(1);
    });

    tauriDriver.on("exit", (code) => {
      if (!exit && code !== 0) {
        console.error("tauri-driver exited with code:", code);
        process.exit(code ?? 1);
      }
    });
  },

  beforeTest: async () => {
    if (watchMode) {
      await browser.pause(1000);
    }
  },
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: applicationPath,
      },
    },
  ],
  framework: "mocha",
  host: "127.0.0.1",
  maxInstances: 1,
  mochaOpts: {
    timeout: 240_000,
    ui: "bdd",
  },

  // Build the debug desktop binary before the webdriver session starts.
  onPrepare: () => {
    if (process.platform === "darwin") {
      console.warn(
        "Official Tauri WebDriver support currently only works on Windows and Linux."
      );
    }

    const build = spawnSync(
      "npm",
      ["run", "tauri", "build", "--", "--debug", "--no-bundle"],
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
  port: 4444,
  reporters: ["spec"],
  specs: ["./test/specs/**/*.ts"],
};

function closeTauriDriver() {
  exit = true;
  tauriDriver?.kill();
}

process.on("exit", closeTauriDriver);
process.on("SIGINT", () => {
  closeTauriDriver();
  process.exit(130);
});
process.on("SIGTERM", () => {
  closeTauriDriver();
  process.exit(143);
});
process.on("SIGHUP", () => {
  closeTauriDriver();
  process.exit(129);
});

if (process.platform === "win32") {
  process.on("SIGBREAK", () => {
    closeTauriDriver();
    process.exit(131);
  });
}
