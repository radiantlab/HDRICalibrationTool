import React from "react";
import InfoIcon from "../tooltips/infoIcon";

/**
 * Reusable Number Input Component for the HDRI Calibration Tool.
 * 
 * This component provides a standardized numeric input field with label.
 * It's used throughout the application for entering numeric configuration values.
 */

/**
 * Props for the NumberInput component
 * 
 * @property handleChange - Function to call when input value changes
 * @property name - Name of the input field (used for form data)
 * @property value - Current value of the input
 * @property label - Label text to display above the input
 * @property placeholder - Placeholder text for the input
 * @property description - Optional description text to display with an info icon
 */
interface NumberInputProps {
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  value: string;
  label: string;
  placeholder: string;
  description?: string;
}

/**
 * Reusable component for numeric input fields
 * 
 * @param props - Component props
 * @returns Styled numeric input field with label
 */
export default function NumberInput({
  handleChange,
  name,
  value,
  label,
  placeholder,
  description
}: NumberInputProps) {    return (
    <div className="mb-4">
      {/* Wrap label + InfoIcon in a flex container so the “?” sits on the same line */}
      <div className="flex items-center mb-1">
        <label htmlFor={name} className="font-medium text-gray-700">
          {label}
        </label>
        {/* Only render the InfoIcon if a description was passed */}
        {description && <InfoIcon text={description} />}
      </div>

      {/* The numeric input field */}
      <input
        id={name}
        name={name}
        type="number"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="
          placeholder:text-right
          no-spinner
          w-full md:w-40
          shadow appearance-none
          border border-gray-400
          rounded
          py-2 px-3
          leading-tight
          focus:outline-none focus:shadow-outline
        "
      />
    </div>
  );
}
