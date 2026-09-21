export default function VoiceInput({ isRecording, isProcessing, onToggle }) {
  const disabled = isProcessing;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      aria-pressed={isRecording}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        isRecording ? "bg-red-500 text-white animate-pulse-ring" : "bg-navy-900 text-white hover:bg-navy-800"
      }`}
    >
      {isProcessing ? (
        <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
          <path d="M19 11a1 1 0 00-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.92V20H9a1 1 0 100 2h6a1 1 0 100-2h-2v-2.08A7 7 0 0019 11z" />
        </svg>
      )}
    </button>
  );
}
