export default function TextInput({ label, placeholderText }: any) {
  return (
    <div>
      <label>{label}</label>
      <input type="text" placeholder={placeholderText}></input>
    </div>
  );
}
