/**
 * Which host the app is running in, and what that host can do.
 *
 * There is one build. Tauri loads the same static export a web server does, so
 * the difference is detected at runtime rather than compiled in. Importing
 * `@tauri-apps/*` in a browser is harmless -- those modules only fail when
 * called, because they look for an injected global -- so the rule is to gate
 * the *calls*, not the imports.
 *
 * Capabilities are reported separately from the host, deliberately. "Is this
 * Tauri" and "can this save a file where the user chose" are different
 * questions, and conflating them is how a browser-only feature ends up gated
 * on the wrong thing. Safari has no File System Access API at all, so the
 * plain `<input type=file>` and download path is not a fallback: it is what
 * most non-Chromium users get.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True where a directory can be chosen and written to without a prompt per file. */
export function hasDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * True where the app can put output files somewhere the user chose.
 *
 * Tauri can always. A browser can only with File System Access; otherwise
 * output is downloaded, which means the browser decides where it lands and
 * the configured output path means nothing.
 */
export function canWriteToChosenDirectory(): boolean {
  return isTauri() || hasDirectoryPicker();
}

/** True where a file can be shown in the OS file manager. Desktop only. */
export function canRevealInFileManager(): boolean {
  return isTauri();
}

export interface AppInfo {
  name: string;
  /** Absent in a browser: there is no Tauri to report a version for. */
  tauriVersion: string | null;
  version: string;
}

/**
 * Name and version.
 *
 * Baked in from package.json for the browser, where Tauri's app API has
 * nothing to answer with. `NEXT_PUBLIC_*` is inlined at build time, so this
 * costs no runtime lookup and cannot disagree with what was shipped.
 */
export async function appInfo(): Promise<AppInfo> {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? "HDRI Calibration Tool";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

  if (!isTauri()) {
    return { name, tauriVersion: null, version };
  }

  const { getName, getTauriVersion, getVersion } = await import(
    "@tauri-apps/api/app"
  );
  return {
    name: await getName(),
    tauriVersion: await getTauriVersion(),
    version: await getVersion(),
  };
}

/**
 * The OS, where it can be known.
 *
 * Used only to pick a path separator and a default output directory, neither
 * of which a browser build has, so "browser" is an honest answer rather than
 * a guess from the user agent.
 */
export async function platformName(): Promise<string> {
  if (!isTauri()) {
    return "browser";
  }
  const { platform } = await import("@tauri-apps/plugin-os");
  return platform();
}
