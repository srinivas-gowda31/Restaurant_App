import { useState } from "react";

export default function TextInput({ onSend, disabled }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 rounded-full border border-brand-200 bg-white px-4 py-2.5 text-sm text-navy-950 placeholder:text-navy-950/40 focus:border-brand-500 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 text-sm font-medium transition-colors"
      >
        Send
      </button>
    </form>
  );
}
