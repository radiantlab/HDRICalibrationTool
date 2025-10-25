import React from "react";

export default function FileFieldRow({ label, value, onBrowse, onClear, onEdit, errorMessage }: { label: string; value: string; onBrowse: () => void; onClear: () => void; onEdit: () => void; errorMessage: string }) {
  // Check if a value exists
  const hasValue = Boolean(value);
  const hasError = Boolean(errorMessage);

  return (
    <div className="flex items-center mb-4">
      {/* Text Field with inline error */}
        <input
          type="text"
          className={`w-full border flex-1 mr-2 ${hasError ? 'border-red-500 text-red-500' : 'border-gray-400'} rounded px-2 py-1`}
          value={hasError ? errorMessage : (value || "")}
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

      {/* Edit/Create Button - changes text based on value existence */}
      <button
        onClick={onEdit}
        className="min-w-[80px] bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-1 px-2 rounded"
      >
        {hasValue ? "Edit" : "Create"}
      </button>
    </div>
  );
}

