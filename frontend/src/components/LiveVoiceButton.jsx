const STATUS_LABEL = {
  idle: "Live Call",
  connecting: "Connecting...",
  connected: "Listening...",
  speaking: "Speaking...",
  error: "Call failed",
};

export default function LiveVoiceButton({ status, error, onStart, onStop }) {
  const isActive = status !== "idle" && status !== "error";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={isActive ? onStop : onStart}
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-navy-900 text-white hover:bg-navy-800"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            status === "speaking"
              ? "bg-gold-400 animate-pulse"
              : status === "connected"
                ? "bg-green-400 animate-pulse"
                : status === "connecting"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-white/40"
          }`}
        />
        {isActive ? `${STATUS_LABEL[status]} (tap to end)` : STATUS_LABEL.idle}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
