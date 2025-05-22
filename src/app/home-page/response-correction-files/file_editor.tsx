"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Paths } from "../string_functions";
import { useConfigStore } from "../../stores/config-store";
import { on } from "events";
import { EditingFileType } from "@/app/global-types";

interface ConfigEditorProps {
  filePath: string;
  isOpen: boolean;
  closeEditor: () => void;
  //setPath: PathSetterFunc;
  editingFileType: EditingFileType;
}

const FileEditor: React.FC<ConfigEditorProps> = ({ filePath, isOpen, closeEditor, editingFileType }) => {

  const [fileContents, setFileContents] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [lineCount, setLineCount] = useState<number>(1);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const { setConfig } = useConfigStore();

  useEffect(() => {
    if (isOpen) {
      // Clear the editor when path is empty or filetype is NONE
      if (!filePath || editingFileType === EditingFileType.NONE) {
        setFileContents("");
        setText("");
        setLineCount(1);
        return;
      }
      
      // Retrieves the contents of the file when the modal is opened
      const fetchFileContents = async () => {
        try {
          const contents = await invoke("read_host_file", { filePath }) as string;
          setFileContents(contents);
          setText(contents);
        } catch (error) {
          console.log("Error fetching file contents: ", error);
        }
      }
      
      fetchFileContents();
    }
  }, [isOpen, filePath, editingFileType]);

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

  // Synchronize scrolling between textarea and line numbers
  const handleScroll = () => {
    if (textAreaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textAreaRef.current.scrollTop;
    }
  };

  const handleSetPath = (newPath: string) => {
  switch(editingFileType) {
    case EditingFileType.RESPONSE:
      setConfig({ responsePaths: newPath });
      break;
    case EditingFileType.FISH_EYE:
      setConfig({ fe_correctionPaths: newPath });
      break;
    case EditingFileType.VIGNETTING:
      setConfig({ v_correctionPaths: newPath });
      break;
    case EditingFileType.NEUTRAL_DENSITY:
      setConfig({ nd_correctionPaths: newPath });
      break;
    case EditingFileType.CALIBRATION_FACTOR:
      setConfig({ cf_correctionPaths: newPath });
      break;
    default:
      console.warn("Unknown file type being edited");
  }
};

  async function saveChangesAs() {
    try {
      // Determine the file filters based on the editing file type
      const fileFilters = editingFileType === EditingFileType.RESPONSE
        ? [{ name: 'Response Files', extensions: ['rsp'] }]
        : [{ name: 'Calibration Files', extensions: ['cal'] }];
      
      // Extract the file base name without extension
      let defaultPath = filePath;
      if (defaultPath) {
        // Remove existing extension if present
        const lastDotIndex = defaultPath.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          defaultPath = defaultPath.substring(0, lastDotIndex);
        }
        
        // Add the appropriate extension
        defaultPath += editingFileType === EditingFileType.RESPONSE ? '.rsp' : '.cal';
      }
      
      // Open save dialog and get the selected path
      const savePath = await save({
        defaultPath,
        filters: fileFilters
      });
      
      if (savePath) {
        await invoke("write_host_file", { filePath: savePath, text });
        handleSetPath(savePath as string);
        closeEditor();
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
      <div className="bg-white p-6 w-4/5 max-h-[80vh] flex flex-col border border-black shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">
            {filePath ? `Edit File: ${Paths(filePath)}` : 'New File'}
          </h2>
          <button
            onClick={closeEditor}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
          >
            Close
          </button>
        </div>
        
        <div className="flex border border-gray-300 rounded flex-grow overflow-hidden h-[50vh]">
          <div 
            ref={lineNumbersRef}
            className="bg-gray-100 py-1 px-2 overflow-y-hidden"
            style={{ overflowY: 'hidden' }}
          >
            {renderLineNumbers()}
          </div>
          <textarea 
            ref={textAreaRef}
            className="w-full outline-none py-1 px-2 resize-none font-mono overflow-y-auto"
            value={text}
            onChange={handleTextChange}
            onScroll={handleScroll}
            style={{ 
              height: '100%',
              lineHeight: '1.5',
              overflowY: 'auto'
            }}
            wrap="off"
          ></textarea>
        </div>
        
        <div className="flex justify-between items-center mt-4">
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
