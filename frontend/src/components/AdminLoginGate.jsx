import { useState } from "react";
import { getAdminKey, setAdminKey } from "../services/adminAuth.js";
import { verifyAdminKey } from "../services/api.js";

export default function AdminLoginGate({ children, onUnlock }) {
  const [unlocked, setUnlocked] = useState(() => Boolean(getAdminKey()));
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setIsChecking(true);
    setError(null);
    try {
      const ok = await verifyAdminKey(input.trim());
      if (!ok) {
        setError("Incorrect admin key.");
        return;
      }
      setAdminKey(input.trim());
      setUnlocked(true);
      // The parent's own effects (e.g. fetching which hotel this key belongs to) ran once on
      // mount, before a key existed yet — a fresh login here needs a way to tell it to retry
      // now that one actually does, since the parent itself never re-mounts from this.
      onUnlock?.();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setIsChecking(false);
    }
  };

  if (unlocked) return children;

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <h1 className="font-serif text-xl font-bold text-navy-950">Admin Access</h1>
        <p className="mt-1 text-sm text-navy-950/60">Enter the admin key to manage the property.</p>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Admin key"
          autoFocus
          className="mt-4 w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
        />
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isChecking}
          className="mt-4 w-full rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-60"
        >
          {isChecking ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
