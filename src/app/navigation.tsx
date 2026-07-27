/**
 * Navigation component for the HDRI Calibration Tool.
 *
 * This component provides the application's main navigation bar with links to different sections
 * of the application. It also displays application information such as name and version numbers
 * retrieved from the Tauri API.
 */
"use client";

import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Main navigation component for the application
 *
 * @returns React component with navigation links and app information
 */
export default function Navigation() {
  const pathname = usePathname();

  const [appVersion, setAppVersion] = useState<string>("");
  const [appName, setAppName] = useState<string>("");
  const [tauriVersion, setTauriVersion] = useState<string>("");

  useEffect(() => {
    /**
     * Retrieves app name, app version, and tauri version from Tauri API
     * and updates the component state with this information
     */
    async function fetchAppInfo() {
      setAppVersion(await getVersion());
      setAppName(await getName());
      setTauriVersion(await getTauriVersion());
    }

    fetchAppInfo();
  }, []);
  return (
    <nav className="z-10 w-full bg-gray-300 text-black">
      {/* Top header with app logo and version information */}
      <div className="h-20 w-full bg-gray-300">
        <div className="mr-8 ml-8 flex h-full items-center justify-between border-gray-400 border-b">
          {/* Logo and app name */}
          <div className="flex items-center" id="logo">
            <img
              alt="Logo"
              className="mr-3 h-10 object-contain"
              height={452}
              src="SunApertureOrange.png"
              width={452}
            />
            <h1 className="font-bold text-2xl">{appName}</h1>
          </div>
          {/* Version information display */}
          <div className="text-right text-gray-600 text-sm">
            <div>App Version: {appVersion}</div>
            <div>Tauri Version: {tauriVersion}</div>
            {/* The pipeline follows this tutorial step by step, and several
                fields cite its sections, so the open-access original has to be
                reachable from inside the app for those citations to be useful. */}
            <div>
              <button
                className="underline hover:text-gray-900"
                onClick={() =>
                  openUrl(
                    "https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319"
                  )
                }
                type="button"
              >
                Luminance Maps tutorial
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <div
        className="mr-8 ml-8 flex h-12 items-center justify-around border-gray-400 border-r border-b border-l"
        id="link-container"
      >
        {/* Image Configuration page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-gray-400 border-r p-2 font-bold ${
            pathname === "/home-page"
              ? "cursor-default bg-white" // Active page styling
              : "cursor-pointer hover:bg-gray-200" // Inactive page styling
          }`}
          href="/home-page"
        >
          Image Generator
        </Link>

        {/* Settings page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-gray-400 border-r p-2 font-bold ${
            pathname === "/settings-page"
              ? "cursor-default bg-white"
              : "cursor-pointer hover:bg-gray-200"
          }`}
          href="/settings-page"
        >
          Settings
        </Link>

        {/* Runs page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-gray-400 border-r p-2 font-bold ${
            pathname.startsWith("/runs")
              ? "cursor-default bg-white"
              : "cursor-pointer hover:bg-gray-200"
          }`}
          href="/runs"
        >
          Runs
        </Link>

        {/* Image Viewer page link */}
        <Link
          className={`flex h-full w-full items-center justify-center p-2 font-bold ${
            pathname.startsWith("/image-viewer")
              ? "cursor-default bg-white"
              : "cursor-pointer hover:bg-gray-200"
          }`}
          href="/image-viewer"
        >
          Image Viewer
        </Link>
      </div>
    </nav>
  );
}
