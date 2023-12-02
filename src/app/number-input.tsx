export default function NumberInput({ label, placeholder }: any) {
  return (
    <div>
      <label>{label}</label>
      <input type="number" placeholder={placeholder} className="placeholder:text-right no-spinner"></input>
    </div>
  );
}
