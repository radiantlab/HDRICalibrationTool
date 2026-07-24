/**
 * Navigation component for the HDRI Calibration Tool.
 *
 * This component provides the application's main navigation bar with links to different sections
 * of the application. It also displays application information such as name and version numbers
 * retrieved from the Tauri API.
 */
"use client";

import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
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
              src="SunApertureOrange.png"
            />
            <h1 className="font-bold text-2xl">{appName}</h1>
          </div>
          {/* Version information display */}
          <div className="text-gray-600 text-sm">
            <div>App Version: {appVersion}</div>
            <div>Tauri Version: {tauriVersion}</div>
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
