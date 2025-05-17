import React from "react";

export default function FileFieldRow({ label, value, onBrowse, onClear, onEdit, errorMessage }: { label: string; value: string; onBrowse: () => void; onClear: () => void; onEdit: () => void; errorMessage: string }) {
  // Check if a value exists
  const hasValue = Boolean(value);

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

      {/* Conditional: Show either Clear or Browse button based on whether a value exists */}
      {hasValue ? (
        <button
          onClick={onClear}
          className="min-w-[80px] bg-gray-300 hover:bg-red-300 text-gray-700 font-semibold py-1 px-2 mr-2 rounded"
        >
          Clear
        </button>
      ) : (
        <button
          onClick={onBrowse}
          className="min-w-[80px] bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 mr-2 rounded"
        >
          Select
        </button>
      )}

      {/* Edit Button - always show but disable when no value */}
      <button
        onClick={onEdit}
        className={`min-w-[80px] font-semibold py-1 px-2 rounded ${!hasValue ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'}`}
        disabled={!hasValue}
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

