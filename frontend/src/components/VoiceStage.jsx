const STATUS_TEXT = {
  idle: "Tap the mic to speak with your concierge",
  connecting: "Connecting…",
  connected: "Listening…",
  speaking: "Speaking…",
  error: "Call failed — tap to try again",
};

const RING_TONE = {
  connecting: "bg-yellow-400/25",
  connected: "bg-brand-400/25",
  speaking: "bg-gold-400/30",
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

function StarRow() {
  return (
    <div className="flex items-center gap-1 text-gold-400" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M10 1.5l2.47 5.24 5.78.55-4.36 3.87 1.3 5.67L10 13.9l-5.19 2.93 1.3-5.67L1.75 7.29l5.78-.55L10 1.5Z" />
        </svg>
      ))}
    </div>
  );
}

export default function VoiceStage({ status, error, onStart, onStop, guestName, roomNumber, onScan, showScan, hotelName }) {
  const isActive = status !== "idle" && status !== "error";
  const isConnecting = status === "connecting";
  const isSpeaking = status === "speaking";
  const isError = status === "error";
  const ringTone = RING_TONE[status] || "bg-brand-400/25";

  return (
    <div className="relative isolate flex h-full flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-3 text-center text-white sm:px-6 sm:py-4">
      {/* Resort-style hero backdrop: real pool photo with a dark overlay, matching the reference layout.
          `isolate` above scopes the negative z-index layers to this box instead of the page root.
          `overflow-y-auto` is a safety net only — sizes below are tuned to fit typical viewports without it kicking in. */}
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center"
        style={{
          backgroundImage:
            "url('https://images.pexels.com/photos/24807133/pexels-photo-24807133.jpeg?auto=compress&cs=tinysrgb&w=1920')",
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(11,20,26,0.72) 0%, rgba(11,20,26,0.5) 45%, rgba(11,20,26,0.82) 100%)",
        }}
      />

      <span className="animate-fade-in text-[10px] font-medium uppercase tracking-[0.3em] text-gold-400/90 sm:tracking-[0.35em]">
        Hotel &amp; Concierge
      </span>

      <h1 className="mt-1.5 animate-fade-in font-serif text-2xl font-bold leading-tight sm:mt-2 sm:text-3xl md:text-4xl">
        {guestName ? `Hello, ${guestName}` : hotelName || "Baikal Sphere"}
      </h1>

      <p className="mt-1.5 max-w-xs animate-fade-in text-xs text-white/70 sm:max-w-sm sm:text-sm">
        {guestName
          ? `Your personal concierge${roomNumber ? ` for Room ${roomNumber}` : ""} is ready whenever you are.`
          : "Tap the mic to speak with your personal concierge — ask about the menu, spa, or place an order."}
      </p>

      {!guestName && onScan && showScan && (
        <button
          type="button"
          onClick={onScan}
          className="mt-2 rounded-full border border-white/25 bg-white/5 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white/90 backdrop-blur transition-colors hover:border-gold-400/60 hover:text-gold-400 sm:text-xs"
        >
          Scan Room QR Code
        </button>
      )}

      <div className="relative mt-3 flex h-24 w-24 shrink-0 items-center justify-center sm:mt-4 sm:h-32 sm:w-32 md:h-36 md:w-36">
        {isActive && (
          <>
            <span
              className={`absolute inset-0 rounded-full ${ringTone} animate-ping`}
              style={{ animationDuration: "2.2s" }}
            />
            <span
              className={`absolute inset-5 rounded-full ${ringTone} animate-ping`}
              style={{ animationDuration: "2.2s", animationDelay: "0.5s" }}
            />
          </>
        )}

        <button
          type="button"
          onClick={isActive ? onStop : onStart}
          disabled={isConnecting}
          aria-label={isActive ? "End the call" : "Start a voice call with the concierge"}
          className={`relative flex h-16 w-16 items-center justify-center rounded-full shadow-xl transition-all duration-300 sm:h-24 sm:w-24 md:h-28 md:w-28 ${
            isError
              ? "bg-red-500 hover:bg-red-600"
              : isActive
                ? "bg-gradient-to-br from-navy-800 to-navy-950 hover:from-navy-900"
                : "bg-gradient-to-br from-gold-500 to-gold-400 hover:scale-105"
          } ${isConnecting ? "cursor-wait opacity-70" : ""} ${isSpeaking ? "ring-4 ring-gold-400/60" : ""}`}
        >
          {isActive ? (
            <EndCallIcon className="h-5 w-5 text-white sm:h-7 sm:w-7" />
          ) : (
            <MicIcon className="h-7 w-7 text-navy-950 sm:h-9 sm:w-9" />
          )}
        </button>
      </div>

      <p className="mt-2 text-xs font-medium text-white/80 sm:mt-3 sm:text-sm">
        {STATUS_TEXT[status] || STATUS_TEXT.idle}
      </p>
      {isActive && <p className="text-[10px] text-white/40 sm:text-xs">tap to end the call</p>}

      {error && <p className="mt-2 text-[10px] text-red-300 sm:text-xs">{error}</p>}

      <div className="mt-3 hidden flex-col items-center gap-1.5 md:flex">
        <StarRow />
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">Always at your service</span>
      </div>
    </div>
  );
}
