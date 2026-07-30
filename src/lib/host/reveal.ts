/**
 * Showing an output file to the user after a run.
 *
 * Desktop only, and that is a genuine capability gap rather than something to
 * paper over. A browser has no file manager to open and no path to open it at:
 * the file went to the download folder, which the browser chose. Callers
 * should ask `canRevealInFileManager()` and not render the control at all,
 * rather than offering one that quietly does nothing.
 */

import { canRevealInFileManager } from "./env";

export async function revealFile(path: string): Promise<void> {
  if (!canRevealInFileManager()) {
    return;
  }
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
