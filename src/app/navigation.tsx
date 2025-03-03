"use client";

import React from "react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";

export default function Navigation() {
  const pathname = usePathname();

  const [appVersion, setAppVersion] = useState<string>("");
  const [appName, setAppName] = useState<string>("");
  const [tauriVersion, setTauriVersion] = useState<string>("");

  useEffect(() => {
    // Retrieves app name, app version, and tauri version from Tauri API
    async function fetchAppInfo() {
      setAppVersion(await getVersion());
      setAppName(await getName());
      setTauriVersion(await getTauriVersion());
    }

    fetchAppInfo();
  }, []);

  return (
    <nav className="bg-gray-300 text-black w-full z-10">
      <div className="fixed h-20 top-0 left-0 w-full bg-gray-300 flex items-center justify-between p-4 border-b border-gray-400">
        <div id="logo" className="flex items-center">
          <img
            src="SunApertureOrange.png"
            className="object-contain h-10 mr-3"
            alt="Logo"
          />
          <h1 className="text-2xl font-bold">{appName}</h1>
        </div>
        <div className="text-sm text-gray-600">
          <div>App Version: {appVersion}</div>
          <div>Tauri Version: {tauriVersion}</div>
        </div>
      </div>
      <div id="link-container" className="flex items-center justify-around h-12 ml-8 mr-8 mt-20 border-l border-r border-gray-400">
        <Link href="/home-page" className={`flex items-center justify-center w-full h-full p-2 font-bold ${pathname === "/home-page" ? "bg-white cursor-default" : "hover:bg-gray-200 cursor-pointer"}`}>
          Image Configuration
        </Link>
        <Link href="/settings-page" className={`flex items-center justify-center w-full h-full p-2 font-bold ${pathname === "/settings-page" ? "bg-white cursor-default" : "hover:bg-gray-200 cursor-pointer"}`}>
          Settings
        </Link>
      </div>
    </nav>
  );
}