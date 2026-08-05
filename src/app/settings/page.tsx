/**
 * Settings Page Component for the LumiLab.
 *
 * The one configurable setting left is the output file location, and it shows
 * only on the desktop: a browser downloads to where the browser decides, so an
 * output path there would be a control that does nothing.
 *
 * It also reports what this build is made of. There used to be paths here for
 * Radiance, hdrgen and dcraw_emu, which the user had to install and locate;
 * every tool now ships with the app as WebAssembly, so the paths are gone and
 * their versions are shown instead. The RAW conversion cache reports its size
 * here too, with a control to empty it.
 *
 * Settings are saved through the Zustand store in `stores/settings-store.ts`,
 * which persists to `localStorage` -- not through Tauri, so the same code path
 * serves both hosts.
 */
"use client";

import prettyBytes from "pretty-bytes";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  TOOL_LABELS,
  TOOL_ORDER,
  TOOL_ROLES,
  type WasmVersions,
  wasmVersions,
} from "@/lib/build-versions";
import { appInfo, canWriteToChosenDirectory } from "@/lib/host/env";
import { openExternal } from "@/lib/host/open-external";
import { pickOutputDirectory } from "@/lib/host/pick";
import { BUDGET_BYTES, createRawCache } from "@/lib/raw-cache";
import { blobStoreAvailable, idbBlobStore } from "@/lib/raw-cache-idb";
import { estimateQuotaBytes } from "@/lib/raw-cache-quota";
import { useSettingsStore } from "../stores/settings-store";
import SettingsButtonBar from "./settings-button-bar";

const handleExternalLink = async (url: string) => {
  await openExternal(url);
};

/**
 * Main Settings Page component
 *
 * @returns React component with settings interface
 */
export default function SettingsPage() {
  const { settings, setSettings } = useSettingsStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [saveDisabled, setSaveDisabled] = useState(true);
  const [_experienceLevel, _setExperienceLevel] = useState("standard");
  const [_consoleInput, _setConsoleInput] = useState("");

  const [appVersion, setAppVersion] = useState<string>("");
  const [appName, setAppName] = useState<string>("");
  const [tauriVersion, setTauriVersion] = useState<string>("");
  const [tools, setTools] = useState<WasmVersions | null>(null);
  // Resolved in an effect rather than inline: this is a static export, so the
  // first render happens at build time where there is no window to ask.
  const [canChooseOutput, setCanChooseOutput] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  // Null distinguishes "no persistent tier on this host" from "empty cache",
  // since the row below hides on null and would misleadingly read 0 B on 0.
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  // F2: never actually painted -- the row above is gated on `cacheBytes !==
  // null`, and the effect below sets both this and `cacheBytes` together
  // from the same `Promise.all` resolution, so there is no frame where one
  // is real and the other is still this initial value. Set to BUDGET_BYTES
  // anyway rather than 0 or null: it is a harmless placeholder for the
  // instant before that effect runs, not a figure this component ever shows.
  const [cacheBudget, setCacheBudget] = useState<number>(BUDGET_BYTES);
  useEffect(() => {
    /**
     * Retrieves app name, app version, and tauri version from Tauri API
     * and updates the component state
     */
    async function fetchAppInfo() {
      const info = await appInfo();
      setAppVersion(info.version);
      setAppName(info.name);
      setTauriVersion(info.tauriVersion ?? "");
    }

    fetchAppInfo();
    setCanChooseOutput(canWriteToChosenDirectory());
    // Surfaced rather than swallowed: a missing versions.json means the wasm
    // artifacts were refreshed without regenerating it, and the numbers shown
    // would otherwise silently describe a different build.
    wasmVersions()
      .then(setTools)
      .catch((error: unknown) => {
        setToolsError(error instanceof Error ? error.message : String(error));
      });

    // Absent on a host without IndexedDB, where there is no persistent tier to
    // report. Zero would claim an empty cache rather than no cache.
    if (blobStoreAvailable()) {
      const cache = createRawCache({
        estimateQuota: estimateQuotaBytes,
        store: idbBlobStore(),
      });
      // Read together and set together: usage and budget are two independent
      // promises, and setting one before the other resolves would paint a
      // frame reporting real usage against the still-nominal budget (or vice
      // versa) -- back to reporting a number this row doesn't mean.
      Promise.all([cache.usage(), cache.budget()])
        .then(([bytes, effectiveBudget]) => {
          setCacheBytes(bytes);
          setCacheBudget(effectiveBudget);
        })
        .catch(() => setCacheBytes(null));
    }
  }, []);

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);
  /**
   * Handles changes to input fields in the settings form
   *
   * @param event - Input change event
   */
  const handleSettingsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const updatedSettings = {
      ...localSettings,
      [event.currentTarget.name]: event.currentTarget.value,
    };
    setLocalSettings(updatedSettings);
    setSaveDisabled(false); // Enable the save button since changes were made
  };

  /**
   * Updates a specific path setting
   *
   * @param id - ID of the setting to update
   * @param path - New path value
   */
  const handleUpdatePath = (id: string, path: string) => {
    setLocalSettings({ ...localSettings, [id]: path });
    setSaveDisabled(false); // Enable the save button since changes were made
  };

  /** Empties the persistent RAW cache and re-reads its size. */
  const handleClearCache = async () => {
    const cache = createRawCache({
      estimateQuota: estimateQuotaBytes,
      store: idbBlobStore(),
    });
    try {
      await cache.clear();
      toast.success("RAW conversion cache cleared");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear the cache"
      );
    } finally {
      // Re-read on both paths: a partial failure still changes what's on
      // disk, so the figure shown must match reality rather than the last
      // success -- otherwise an error toast sits next to a stale number.
      await cache
        .usage()
        .then(setCacheBytes)
        .catch(() => undefined);
    }
  };

  /**
   * Opens a file/directory selection dialog
   *
   * @param id - ID of the setting to update
   * @param label - Label for the dialog title
   * @param isDirectory - Whether to select a directory (true) or a file (false)
   */
  const dialog = async (id: string, label: string, _isDirectory = false) => {
    const selectedPath = await pickOutputDirectory(`Select${label}Path`);
    if (selectedPath !== null) {
      handleUpdatePath(id, selectedPath);
    }
  };
  /**
   * Saves the current settings to global store and persistent storage
   *
   * Updates the global settings store with the local settings
   * Writes binary paths to persistent storage via Tauri API
   * Disables the save button and displays a confirmation message
   */
  const savePaths = () => {
    setSettings(localSettings);
    setSaveDisabled(true);
    toast.success("Changes saved.");
  };

  return (
    // Column, not a scrolling box. The action bar is a sibling of the scroll
    // area rather than floating over it: it used to be `fixed bottom-0`, which
    // covered whatever the page ended with, and no amount of bottom margin
    // fixes that reliably because the bar's height is not the margin's
    // business. `min-h-0` is what lets the middle child shrink and take the
    // overflow, since the body is `h-screen overflow-hidden`.
    <div className="flex min-h-0 flex-1 flex-col bg-muted text-foreground">
      <main className="mx-8 mb-8 min-h-0 flex-1 overflow-y-auto border-border border-r border-l bg-background p-5">
        <div className="grid grid-cols-1 gap-6">
          {/* Left: External Utilities */}
          <div className="rounded-lg border border-border p-5">
            <h2 className="mb-4 flex items-center font-bold text-xl">
              {canChooseOutput ? "Paths" : "Output"}
            </h2>

            {canChooseOutput ? null : (
              <p className="mb-4 text-muted-foreground text-sm">
                Generated images are downloaded, so where they are saved is your
                browser's setting rather than this app's. There is nothing to
                configure here.
              </p>
            )}

            {/*
              Mapping through the settings fields to create input sections for each
            */}
            {(canChooseOutput
              ? [
                  {
                    id: "outputPath",
                    label: "HDRI Output",
                    placeholder: "This path is required",
                    value: localSettings.outputPath,
                  },
                ]
              : []
            ).map(({ id, label, value, placeholder }) => (
              <div className="mb-4" key={id}>
                <label className="mb-1 block font-semibold" htmlFor={id}>
                  {label}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    className="grow rounded border border-input bg-background px-2 py-1"
                    id={id}
                    name={id}
                    onChange={handleSettingsChange}
                    placeholder={placeholder}
                    type="text"
                    value={value}
                  />
                  <button
                    className="rounded bg-secondary px-2 py-1 font-semibold text-secondary-foreground hover:bg-secondary/80"
                    onClick={() =>
                      setLocalSettings({ ...localSettings, [id]: "" })
                    }
                    type="button"
                  >
                    Clear
                  </button>
                  <button
                    className="rounded bg-secondary px-2 py-1 font-semibold text-secondary-foreground hover:bg-secondary/80"
                    onClick={() => dialog(id, label, id === "outputPath")}
                    type="button"
                  >
                    Select
                  </button>
                </div>
                {id === "dcrawEmuPath" && (
                  <div className="mr-5 block h-full text-sm">
                    <span className="font-mono">dcraw_emu</span> is part of
                    LibRaw, which is licensed under{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      LGPL-2.1
                    </a>
                    . The source code can be obtained from{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://www.libraw.org/"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink("https://www.libraw.org/");
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      the LibRaw official website
                    </a>
                    .
                  </div>
                )}
                {id === "hdrgenPath" && (
                  <div className="mr-5 block h-full text-sm">
                    <span className="font-mono">hdrgen</span> is the work of
                    Gregory J. Ward and is licensed under{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://github.com/radiance-org/hdrgen/blob/main/LICENSE"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      BSD 3-Clause License
                    </a>
                    . The source code can be obtained from{" "}
                    <a
                      className="underline hover:no-underline"
                      href="https://github.com/radiance-org/hdrgen/"
                      onClick={(e) => {
                        e.preventDefault();
                        handleExternalLink(
                          "https://github.com/radiance-org/hdrgen/"
                        );
                      }}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      the GitHub repository
                    </a>
                    .
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* What this build is made of. Moved here from the header, which had
              room for the app and Tauri versions only, and none for the tools
              that actually do the work. */}
          <div className="rounded-lg border border-border p-5">
            <h2 className="mb-4 font-bold text-xl">About this build</h2>

            <dl className="mb-5 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-semibold">{appName || "Application"}</dt>
              <dd>{appVersion || "\u2014"}</dd>
              {tauriVersion ? (
                <>
                  <dt className="font-semibold">Tauri</dt>
                  <dd>{tauriVersion}</dd>
                </>
              ) : null}
            </dl>

            <h3 className="mb-1 font-semibold">Image processing tools</h3>
            <p className="mb-3 text-muted-foreground text-sm">
              These run inside the app as WebAssembly. Nothing needs installing,
              and there are no paths to configure.
            </p>

            {toolsError ? (
              <p className="text-destructive text-sm">
                Could not read the tool versions: {toolsError}
              </p>
            ) : (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                {TOOL_ORDER.map((name) => {
                  const tool = tools?.tools[name];
                  return (
                    <div className="contents" key={name}>
                      <dt className="font-semibold">{TOOL_LABELS[name]}</dt>
                      <dd>
                        <span>{tool ? tool.version : "\u2026"}</span>
                        <span className="block text-muted-foreground">
                          {TOOL_ROLES[name]}
                        </span>
                        {tool ? (
                          <span className="block font-mono text-muted-foreground text-xs">
                            {tool.repository} @ {tool.commit.slice(0, 8)}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
                {tools ? (
                  <div className="contents">
                    <dt className="font-semibold">Emscripten</dt>
                    <dd>{tools.emscripten}</dd>
                  </div>
                ) : null}
              </dl>
            )}

            {/*
              Required, not decorative. Serving .wasm is conveying object code
              under GPL-3, and section 6(d) wants "clear directions next to the
              object code" for obtaining the Corresponding Source. A link in
              the repository is not next to the object code; this is. See
              licenses/DECISIONS.md.
            */}
            <p className="mt-5 border-border border-t pt-4 text-muted-foreground text-sm">
              This application is free software, licensed{" "}
              <strong>GPL-3.0</strong>. The complete source, including the forks
              the tools above are built from, is at{" "}
              <button
                className="underline hover:text-foreground"
                onClick={() =>
                  openExternal("https://github.com/radiantlab/LumiLab")
                }
                type="button"
              >
                github.com/radiantlab/LumiLab
              </button>
              .
            </p>
          </div>

          {/* Its own card rather than folded into "About this build": a
              clearable disk cache is not part of what the build is made of,
              and interposing it there would sit between the tool versions
              and the GPL notice, which the comment above needs adjacent to
              the tools it documents. */}
          {cacheBytes !== null && (
            <div className="rounded-lg border border-border p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-xl">RAW conversion cache</h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {prettyBytes(cacheBytes)} of {prettyBytes(cacheBudget)}{" "}
                    used. Converted frames are reused instead of demosaiced
                    again.
                  </p>
                </div>
                <button
                  className="rounded bg-secondary px-2 py-1 font-semibold text-secondary-foreground hover:bg-secondary/80"
                  onClick={handleClearCache}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <SettingsButtonBar saveDisabled={saveDisabled} savePaths={savePaths} />
    </div>
  );
}
