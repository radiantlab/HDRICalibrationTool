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
 */
interface NumberInputProps {
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  value: string;
  label: string;
  placeholder: string;
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
}: NumberInputProps) {  return (
    <div className="mb-4">
      <label className="block mb-2">{label}</label>
      <input
        onChange={handleChange}
        name={name}
        value={value}
        type="number"
        placeholder={placeholder}
        className="placeholder:text-right no-spinner w-full md:w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
      ></input>
    </div>
  );
}
