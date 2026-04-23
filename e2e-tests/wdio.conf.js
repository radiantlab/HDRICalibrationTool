import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

let tauriDriver;
let exit = false;

export const config = {
  host: "127.0.0.1",
  port: 4444,
  specs: ["./test/specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: applicationPath,
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
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
        stdio: "inherit",
        shell: true,
      }
    );

    if (build.status !== 0) {
      process.exit(build.status ?? 1);
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

  afterSession: () => {
    closeTauriDriver();
  },
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
