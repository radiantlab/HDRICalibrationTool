/**
 * Navigation component for the HDRI Calibration Tool.
 * 
 * This component provides the application's main navigation bar with links to different sections
 * of the application. It also displays application information such as name and version numbers
 * retrieved from the Tauri API.
 */
"use client";

import React from "react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";

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
    <nav className="bg-gray-300 text-black w-full z-10 fixed top-0 left-0">
      {/* Top header with app logo and version information */}
      <div className="h-20 w-full bg-gray-300">
        <div className="h-full mr-8 ml-8 flex items-center justify-between border-b border-gray-400">
          {/* Logo and app name */}
          <div id="logo" className="flex items-center">
            <img
              src="SunApertureOrange.png"
              className="object-contain h-10 mr-3"
              alt="Logo"
            />
            <h1 className="text-2xl font-bold">{appName}</h1>
          </div>
          {/* Version information display */}
          <div className="text-sm text-gray-600">
            <div>App Version: {appVersion}</div>
            <div>Tauri Version: {tauriVersion}</div>
          </div>
        </div>
      </div>
      
      {/* Navigation links */}
      <div
        id="link-container"
        className="flex items-center justify-around h-12 ml-8 mr-8 border-l border-r border-b border-gray-400"
      >
        {/* Image Configuration page link */}
        <Link
          href="/home-page"
          className={`flex items-center justify-center w-full h-full p-2 font-bold border-r border-gray-400 ${
            pathname === "/home-page"
              ? "bg-white cursor-default"  // Active page styling
              : "hover:bg-gray-200 cursor-pointer"  // Inactive page styling
          }`}
        >
          Image Configuration
        </Link>
        
        {/* Settings page link */}
        <Link
          href="/settings-page"
          className={`flex items-center justify-center w-full h-full p-2 font-bold border-r border-gray-400 ${
            pathname === "/settings-page"
              ? "bg-white cursor-default"
              : "hover:bg-gray-200 cursor-pointer"
          }`}
        >
          Settings
        </Link>
        
        {/* Image Viewer page link */}
        <Link
          href="/image-viewer"
          className={`flex items-center justify-center w-full h-full p-2 font-bold ${
            pathname === "/image-viewer"
              ? "bg-white cursor-default"
              : "hover:bg-gray-200 cursor-pointer"
          }`}
        >
          Image Viewer
        </Link>
      </div>
    </nav>
  );
}