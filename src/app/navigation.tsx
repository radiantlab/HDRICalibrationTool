"use client";

import React from "react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getName } from "@tauri-apps/api/app";

export default function Navigation() {
  const [appName, setAppName] = useState<string>("HDRI Calibration Interface");
  const pathname = usePathname();

  useEffect(() => {
    // Retrieves app name from Tauri API
    async function fetchAppInfo() {
      setAppName(await getName());
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
      </div>
      <div id="link-container" className="flex items-center justify-around h-12 ml-8 mr-8 mt-20 border-l border-r border-gray-400">
        <Link href="/home-page" className={`flex items-center justify-center w-full h-full p-2 cursor-pointer ${pathname === "/home-page" ? "bg-white" : "hover:bg-gray-200"}`}>
          Image Configuration
        </Link>
        <Link href="/settings-page" className={`flex items-center justify-center w-full h-full p-2 cursor-pointer ${pathname === "/settings-page" ? "bg-white" : "hover:bg-gray-200"}`}>
          Settings
        </Link>
      </div>
    </nav>
  );
}