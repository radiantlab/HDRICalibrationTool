export default function NumberInput({
  handleChange,
  name,
  label,
  placeholder,
  defaultValue,
}: any) {
  return (
    <div>
      <label>{label}</label>
      <input
        onChange={handleChange}
        name={name}
        type="number"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="placeholder:text-right no-spinner"
      ></input>
    </div>
  );
}
