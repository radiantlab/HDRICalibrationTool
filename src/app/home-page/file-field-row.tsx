import React from "react";

export default function FileFieldRow({ label, value, onBrowse, onClear, onEdit, errorMessage }: { label: string; value: string; onBrowse: () => void; onClear: () => void; onEdit: () => void; errorMessage: string }) {
  return (
    <div className="flex items-center mb-4">
      {/* Text Field */}
      <input
        type="text"
        className="flex-1 border border-gray-400 rounded px-2 py-1 mr-2"
        value={value || ""}
        placeholder={label}
        readOnly
      />

      {/* Clear Button */}
      <button
        onClick={onClear}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 mr-2 rounded"
      >
        Clear
      </button>

      {/* Browse Button */}
      <button
        onClick={onBrowse}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 mr-2 rounded"
      >
        Select
      </button>

      {/* Edit Button */}
      <button
        onClick={onEdit}
        className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
      >
        Edit
      </button>

      {/* Error message */}
      {errorMessage && (
        <div className="text-red-500 text-xs mt-1">{errorMessage}</div>
      )}
    </div>
  );
}

