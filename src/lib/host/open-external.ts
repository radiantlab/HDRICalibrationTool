/**
 * Opens a link outside the app.
 *
 * Tauri needs its opener plugin: a plain anchor inside the webview would
 * navigate the app away from itself. A browser already knows how, and a new
 * tab is what the user expects.
 */

import { isTauri } from "./env";

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
