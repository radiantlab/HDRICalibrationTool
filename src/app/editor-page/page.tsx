"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/tauri";
import { getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";

export default function EditorPage() {
  const [appVersion, setAppVersion] = useState<string>("");
  const [appName, setAppName] = useState<string>("");
  const [tauriVersion, setTauriVersion] = useState<string>("");
  const [fileContents, setFileContents] = useState<string>("");
  const [text, setText] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Retrieves app name, app version, and tauri version from Tauri API
    async function fetchAppInfo() {
      setAppVersion(await getVersion());
      setAppName(await getName());
      setTauriVersion(await getTauriVersion());
    }

    // Retrieves the contents of the file whose path was passed as a query parameter
    async function fetchFileContents() {
      const filePath = searchParams.get("filepath")
      invoke("read_host_file", { filePath: filePath })
        .then((contents) => setFileContents(contents as string))
        .catch((error) => console.log("Error fetching file contents: ", error));
    }

    fetchAppInfo();
    fetchFileContents();
    window.scrollTo(0, 0);
  }, []);

  function saveChanges() {
    const filePath = searchParams.get("filepath")
    console.log("File path: ", filePath);
    invoke("write_host_file", { filePath: filePath, text: text })
      .catch((error) => console.log("Error writing file contents: ", error));
  }

  return (
   <div className="bg-gray-300 text-black grid grid-cols-4 min-h-screen">
      <main className="bg-white col-span-4 m-8 mt-0 p-5 mb-10 border-l border-r border-gray-400">
        <button
          onClick={() => router.back()}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Back
        </button>
        <textarea 
          className="w-full h-full" 
          defaultValue={fileContents}
          onChange={(event) => {setText(event.target.value)}}
        ></textarea>
        <button
          onClick={saveChanges}
          className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 border-gray-400 rounded"
        >
          Apply Changes
        </button>
      </main>
    </div>
  );
}
