const SUGGESTIONS = [
  "Show me vegetarian mains",
  "What spa services do you offer?",
  "I'd like to order a Margherita Pizza",
  "What desserts do you have?",
];

export default function WelcomeCard({ onSuggestion, guestName, roomNumber, onScan }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center animate-fade-in">
      <h1 className="font-serif text-2xl font-bold text-navy-950 sm:text-3xl">
        {guestName ? `Hello, ${guestName}!` : "Welcome to The Baikal Sphere Hotel"}
      </h1>
      <p className="mt-2 max-w-md text-sm text-navy-950/70">
        {guestName ? (
          <>
            Welcome back{roomNumber ? ` to Room ${roomNumber}` : ""}. I'm your personal concierge — how may I help
            you today?
          </>
        ) : (
          "I'm your personal concierge. Ask me about our menu or spa services, by voice or by text, and I'll help you place an order."
        )}
      </p>

      {!guestName && onScan && (
        <button
          type="button"
          onClick={onScan}
          className="mt-4 rounded-full border border-brand-300 bg-white px-5 py-2 text-sm font-medium text-brand-600 shadow-sm transition-colors hover:bg-brand-50"
        >
          Scan Room QR Code
        </button>
      )}

      <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggestion(s)}
            className="rounded-xl border border-brand-200 bg-white px-4 py-3 text-left text-sm text-navy-950 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
