export default function NumberInput({
  handleChange,
  name,
  value,
  label,
  placeholder,
}: any) {
  return (
    <div className="mb-4">
      <label className="block mb-2">{label}</label>
      <input
        onChange={handleChange}
        name={name}
        value={value}
        type="number"
        placeholder={placeholder}
        className="placeholder:text-right no-spinner w-40 shadow appearance-none border border-gray-400 rounded py-2 px-3 leading-tight focus:outline-none focus:shadow-outline"
      ></input>
    </div>
  );
}
