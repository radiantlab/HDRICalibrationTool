"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/tauri";
import { save } from '@tauri-apps/api/dialog';
import { Paths } from "../string_functions";

// Converted to a component that can be imported
interface ConfigEditorProps {
  filePath: string;
  isOpen: boolean;
  onClose: () => void;
}

const FileEditor: React.FC<ConfigEditorProps> = ({ filePath, isOpen, onClose }) => {
  const [fileContents, setFileContents] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [lineCount, setLineCount] = useState<number>(1);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && filePath) {
      // Retrieves the contents of the file when the modal is opened
      const fetchFileContents = async () => {
        try {
          const contents = await invoke("read_host_file", { filePath }) as string;
          setFileContents(contents);
          setText(contents);
          setIsSaved(false);
        } catch (error) {
          console.log("Error fetching file contents: ", error);
        }
      }
      
      fetchFileContents();
    }
  }, [isOpen, filePath]);

  // Calculate line numbers whenever text changes
  useEffect(() => {
    if (fileContents) {
      const lines = fileContents.split('\n').length;
      setLineCount(lines);
    }
  }, [fileContents]);

  // Update line count when text changes
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = event.target.value;
    setText(newText);
    const lines = newText.split('\n').length;
    setLineCount(lines);
  };

  // Add a new function for "Save As"
  async function saveChangesAs() {
    try {
      // Open save dialog and get the selected path
      const savePath = await save({
        defaultPath: filePath,
        filters: [{
          name: 'Text',
          extensions: ['txt', 'conf', 'ini', 'json', '*']
        }]
      });
      
      if (savePath) {
        await invoke("write_host_file", { filePath: savePath, text });
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      }
    } catch (error) {
      console.log("Error saving file: ", error);
    }
  }

  // Generate line numbers
  const renderLineNumbers = () => {
    const numbers = [];
    for (let i = 1; i <= lineCount; i++) {
      numbers.push(
        <div key={i} className="text-right pr-2 text-gray-500 select-none">
          {i}
        </div>
      );
    }
    return numbers;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white p-6 w-4/5 max-h-5/6 flex flex-col border border-black shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Edit File: {Paths(filePath)}</h2>
          <button
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
          >
            Close
          </button>
        </div>
        
        <div className="flex border border-gray-300 rounded flex-grow overflow-hidden">
          <div className="bg-gray-100 py-1 px-2 overflow-y-auto">
            {renderLineNumbers()}
          </div>
          <textarea 
            className="w-full outline-none py-1 px-2 resize-none font-mono overflow-y-auto"
            value={text}
            onChange={handleTextChange}
            style={{ minHeight: '50vh', lineHeight: '1.5' }}
            wrap="off"
          ></textarea>
        </div>
        
        {/* Update the UI buttons section */}
        <div className="flex justify-between items-center mt-4">
          {isSaved && <span className="text-green-500">Changes saved successfully!</span>}
          <div className="ml-auto flex gap-2">
            <button
              onClick={saveChangesAs}
              className="w-max bg-osu-beaver-orange hover:bg-osu-luminance text-white font-semibold py-1 px-2 border-gray-400 rounded"
            >
              Save file as...
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export the component for importing
export { FileEditor };
