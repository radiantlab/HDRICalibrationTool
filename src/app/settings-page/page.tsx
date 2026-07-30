/**
 * Settings Page Component for the HDRI Calibration Tool.
 *
 * This component allows users to configure application settings including:
 * - Output file location
 * - User experience level
 * - Debug console access
 *
 * It also reports what this build is made of. There used to be paths here for
 * Radiance, hdrgen and dcraw_emu, which the user had to install and locate;
 * every tool now ships with the app as WebAssembly, so the paths are gone and
 * their versions are shown instead.
 *
 * Settings are saved to persistent storage via Tauri API calls.
 */
"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { appInfo, canWriteToChosenDirectory } from "@/lib/host/env";
import { openExternal } from "@/lib/host/open-external";
import { pickOutputDirectory } from "@/lib/host/pick";
import {
  TOOL_LABELS,
  TOOL_ORDER,
  TOOL_ROLES,
  type WasmVersions,
  wasmVersions,
} from "@/lib/build-versions";
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
    // The body is `h-screen overflow-hidden` so the home page can manage its
    // own panel scrolling, which means any page taller than the viewport is
    // clipped rather than scrolled unless it scrolls itself. `min-h-0` is what
    // lets a flex child actually shrink and hand the overflow to this
    // container instead of growing past it.
    <div className="grid min-h-0 flex-1 grid-cols-4 overflow-y-auto bg-muted text-foreground">
      <main className="col-span-4 m-8 mt-0 mb-10 border-border border-r border-l bg-background p-5">
        <div className="grid grid-cols-1 gap-6">
          {/* Left: External Utilities */}
          <div className="rounded-lg border border-border p-5">
            <h2 className="mb-4 flex items-center font-bold text-xl">
              {canChooseOutput ? "Paths" : "Output"}
            </h2>

            {canChooseOutput ? null : (
              <p className="mb-4 text-muted-foreground text-sm">
                Generated images are downloaded, so where they are saved is
                your browser's setting rather than this app's. There is nothing
                to configure here.
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
          </div>
        </div>
      </main>

      <SettingsButtonBar saveDisabled={saveDisabled} savePaths={savePaths} />
    </div>
  );
}
