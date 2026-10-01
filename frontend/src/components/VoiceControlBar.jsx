const STATUS_LABEL = {
  idle: "Call ended — tap to talk again",
  connecting: "Connecting…",
  connected: "Listening…",
  speaking: "Speaking…",
  error: "Call failed — tap to retry",
};

const DOT_TONE = {
  connecting: "bg-yellow-400 animate-pulse",
  connected: "bg-green-400 animate-pulse",
  speaking: "bg-gold-400 animate-pulse",
  error: "bg-white",
  idle: "bg-white/40",
};

function MicIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function EndCallIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export default function VoiceControlBar({ status, error, onStart, onStop }) {
  const isActive = status !== "idle" && status !== "error";
  const isConnecting = status === "connecting";

  return (
    <div className="border-t border-brand-100 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-navy-950/70">
          <span className={`h-2 w-2 rounded-full ${DOT_TONE[status] || DOT_TONE.idle}`} />
          {STATUS_LABEL[status] || STATUS_LABEL.idle}
        </div>

        <button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={isConnecting}
          aria-label={isActive ? "End the call" : "Start a voice call with the concierge"}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-md transition-all duration-300 ${
            status === "error"
              ? "bg-red-500 hover:bg-red-600"
              : isActive
                ? "bg-gradient-to-br from-navy-800 to-navy-950 hover:from-navy-900"
                : "bg-gradient-to-br from-brand-600 to-navy-900 hover:scale-105"
          } ${isConnecting ? "cursor-wait opacity-70" : ""}`}
        >
          {isActive ? <EndCallIcon className="h-5 w-5 text-white" /> : <MicIcon className="h-6 w-6 text-white" />}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
