/**
 * Choosing files, in whichever host is running.
 *
 * Deliberately built on `<input type="file">` rather than File System Access.
 * Safari implements none of File System Access -- no `showOpenFilePicker`, no
 * `showDirectoryPicker` -- so the input element is not a degraded fallback, it
 * is the path most non-Chromium users take. Making it the primary means the
 * behaviour everyone gets is the behaviour that was built and tested, rather
 * than a branch that only runs on the machines nobody develops on.
 *
 * Everything returns **paths**, not `File` objects. The pipeline takes
 * `string[]`, builds argv out of paths, and uses argv as its dependency list;
 * that contract is what the byte-identical validation was measured against.
 * In a browser the paths are synthetic and `vfs.ts` resolves them.
 */

import { isTauri } from "./env";
import { registerSessionFile } from "../vfs";

export interface PickFilter {
  extensions: string[];
  name: string;
}

export interface PickOptions {
  /** Offered to the OS dialog; also drives the input's `accept`. */
  filters?: PickFilter[];
  multiple?: boolean;
  title?: string;
}

/**
 * Returns chosen paths, or an empty array if the user cancelled.
 *
 * Cancellation is an empty array rather than null so callers do not have to
 * distinguish "nothing chosen" from "cancelled". Nothing in this app treats
 * them differently.
 */
export async function pickFiles(options: PickOptions = {}): Promise<string[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const chosen = await open({
      filters: options.filters,
      multiple: options.multiple ?? false,
      title: options.title,
    });
    if (chosen === null) {
      return [];
    }
    return Array.isArray(chosen) ? chosen : [chosen];
  }

  const files = await promptForFiles({
    accept: acceptAttribute(options.filters),
    multiple: options.multiple ?? false,
  });
  return await registerAll(files);
}

/**
 * Returns the paths of every accepted file in a chosen directory.
 *
 * A directory *path* is not returned, because a browser cannot produce one and
 * nothing downstream needs it: every caller immediately enumerated the
 * directory anyway. `webkitdirectory` is supported everywhere including Safari,
 * and unlike `showDirectoryPicker` it needs no permission prompt.
 *
 * The trade is that the selection is a snapshot. There is no handle to re-read
 * later, so a file added to the folder afterwards will not appear until the
 * user picks it again.
 */
export async function pickDirectoryFiles(
  options: { filters?: PickFilter[] } = {}
): Promise<string[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const directory = await open({ directory: true, multiple: false });
    if (typeof directory !== "string") {
      return [];
    }
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");
    const entries = await readDir(directory);
    const accepted = entries.filter(
      (entry) => entry.isFile && matches(entry.name, options.filters)
    );
    return await Promise.all(
      accepted.map((entry) => join(directory, entry.name))
    );
  }

  const files = await promptForFiles({ directory: true, multiple: true });
  const accepted = files.filter((file) => matches(file.name, options.filters));
  return await registerAll(accepted);
}

/** A named group of images, which the image matrix renders as one row. */
export interface ImageSetSelection {
  files: string[];
  name: string;
}

/**
 * Chooses images and groups them into sets.
 *
 * The grouping is the part that differs by host, which is why it lives here
 * rather than in the component. On the desktop a set is a directory, and its
 * name is that directory's basename. In a browser, `webkitdirectory` reports
 * `webkitRelativePath`, so nested folders still become separate sets; a plain
 * multi-file selection has no directory information at all and becomes one
 * set, because that is the honest answer rather than a guess.
 */
export async function pickImageSets(options: {
  directory: boolean;
  filters?: PickFilter[];
}): Promise<ImageSetSelection[]> {
  if (isTauri()) {
    return await pickImageSetsWithTauri(options);
  }

  const files = (
    await promptForFiles({
      accept: acceptAttribute(options.filters),
      directory: options.directory,
      multiple: true,
    })
  ).filter((file) => matches(file.name, options.filters));

  if (files.length === 0) {
    return [];
  }

  const groups = new Map<string, File[]>();
  for (const file of files) {
    const relative = (file as { webkitRelativePath?: string })
      .webkitRelativePath;
    // The first segment is the directory the user picked; the second is a
    // subfolder within it, which is the level that corresponds to a set.
    const segments = relative ? relative.split("/") : [];
    const name =
      segments.length > 2
        ? (segments.at(-2) as string)
        : (segments[0] ?? "Images");
    const group = groups.get(name) ?? [];
    group.push(file);
    groups.set(name, group);
  }

  return await Promise.all(
    Array.from(groups.entries()).map(async ([name, group]) => ({
      files: await registerAll(
        group.toSorted((a, b) => a.name.localeCompare(b.name))
      ),
      name,
    }))
  );
}

async function pickImageSetsWithTauri(options: {
  directory: boolean;
  filters?: PickFilter[];
}): Promise<ImageSetSelection[]> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({
    directory: options.directory,
    filters: options.filters,
    multiple: true,
  });
  if (chosen === null) {
    return [];
  }
  const paths = Array.isArray(chosen) ? chosen : [chosen];
  const { basename, dirname, join } = await import("@tauri-apps/api/path");
  const { readDir } = await import("@tauri-apps/plugin-fs");

  const groups = new Map<string, string[]>();
  for (const rawPath of paths.toSorted((a, b) => a.localeCompare(b))) {
    const directoryPath = options.directory
      ? rawPath
      : await dirname(rawPath);
    const name = await basename(directoryPath);
    const entries = options.directory
      ? (await readDir(rawPath))
          .filter((entry) => entry.isFile && matches(entry.name, options.filters))
          .map((entry) => join(rawPath, entry.name))
      : [Promise.resolve(rawPath)];
    const group = groups.get(name) ?? [];
    group.push(...(await Promise.all(entries)));
    groups.set(name, group);
  }

  return Array.from(groups.entries()).map(([name, files]) => ({
    files,
    name,
  }));
}

/**
 * Chooses a directory to write output into, where that is meaningful.
 *
 * Null in a browser. Nothing is being hidden by that: without File System
 * Access there is no way to write to a chosen directory, and where a download
 * lands is the browser's decision, so an output path would be a setting that
 * does nothing. `canWriteToChosenDirectory` is what the UI should ask before
 * offering the control at all.
 */
export async function pickOutputDirectory(
  title?: string
): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({ directory: true, multiple: false, title });
  return typeof chosen === "string" ? chosen : null;
}

async function registerAll(files: File[]): Promise<string[]> {
  return await Promise.all(
    files.map(async (file) =>
      registerSessionFile(file.name, new Uint8Array(await file.arrayBuffer()))
    )
  );
}

function matches(name: string, filters?: PickFilter[]): boolean {
  if (!filters || filters.length === 0) {
    return true;
  }
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return filters.some((filter) =>
    filter.extensions.some((candidate) => candidate.toLowerCase() === extension)
  );
}

function acceptAttribute(filters?: PickFilter[]): string | undefined {
  if (!filters || filters.length === 0) {
    return;
  }
  return filters
    .flatMap((filter) => filter.extensions.map((ext) => `.${ext}`))
    .join(",");
}

/**
 * Shows a file input and resolves with what was chosen.
 *
 * The element is created, clicked and discarded rather than rendered, because
 * every call site is an imperative "open the picker now" that used to be a
 * Tauri dialog. It must be in the document for Safari to open the picker at
 * all.
 *
 * There is no reliable cancel event: `cancel` is not supported everywhere, so
 * a user who dismisses the dialog resolves with nothing on the next `focus`
 * instead. Without that the promise would never settle and the caller would
 * wait forever.
 */
function promptForFiles(options: {
  accept?: string | undefined;
  directory?: boolean;
  multiple: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options.multiple;
    if (options.accept) {
      input.accept = options.accept;
    }
    if (options.directory) {
      // Not in the HTML type definitions; supported by every target browser.
      (input as unknown as Record<string, unknown>).webkitdirectory = true;
    }
    input.style.display = "none";
    document.body.appendChild(input);

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      window.removeEventListener("focus", onFocus);
      resolve(files);
    };

    const onFocus = () => {
      // The focus event arrives before the input's change event, so give the
      // change a chance to land before concluding the dialog was dismissed.
      setTimeout(() => finish(Array.from(input.files ?? [])), 300);
    };

    input.addEventListener("change", () =>
      finish(Array.from(input.files ?? []))
    );
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}
