import { useState } from "react";
import { Link } from "react-router-dom";

function MenuIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function BagIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 8h12l-1 12H7L6 8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function StarRow() {
  return (
    <div className="hidden items-center gap-1 text-gold-400 sm:flex" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
          <path d="M10 1.5l2.47 5.24 5.78.55-4.36 3.87 1.3 5.67L10 13.9l-5.19 2.93 1.3-5.67L1.75 7.29l5.78-.55L10 1.5Z" />
        </svg>
      ))}
    </div>
  );
}

// Falls back to the original single-hotel branding when no hotelName prop is given (an admin
// page, or a guest page that hasn't resolved its hotel yet) — never a blank/broken-looking header.
const DEFAULT_HOTEL_NAME = "Baikal Sphere";

function hotelInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "H";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function Header({ onToggleOrder, orderCount = 0, onScan, hotelName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = hotelName || DEFAULT_HOTEL_NAME;

  return (
    <header className="sticky top-0 z-30 bg-navy-950/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy-950/85">
      {/* Utility bar: hamburger / est. year — centered brand mark — stars / cart, like the reference's thin top row */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-3 items-center gap-3 border-b border-white/10 px-4 py-1.5 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-brand-100/80 transition-colors hover:text-white sm:hidden"
          >
            {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <span className="hidden text-[11px] uppercase tracking-[0.3em] text-white/40 sm:block">Est. 2024</span>
        </div>

        <Link
          to="/"
          className="flex items-center justify-center gap-2.5 sm:gap-3"
          onClick={() => setMenuOpen(false)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold-400/60 font-serif text-sm text-gold-400">
            {hotelInitials(displayName)}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-serif text-base tracking-wide text-white sm:text-lg">{displayName}</span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-gold-400/80">Hotel &amp; Concierge</span>
          </span>
        </Link>

        <div className="flex items-center justify-end gap-3">
          <StarRow />
          {onToggleOrder && (
            <button
              type="button"
              onClick={onToggleOrder}
              aria-label="View my order"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-brand-100/80 transition-colors hover:border-gold-400/60 hover:text-gold-400 sm:hidden"
            >
              <BagIcon className="h-4 w-4" />
              {orderCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-[11px] font-bold text-navy-950">
                  {orderCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Nav row: mirrors the reference's second link bar under the utility row */}
      <nav className="hidden items-center justify-center gap-2.5 border-b border-white/10 py-1.5 sm:flex">
        {onScan && (
          <button
            type="button"
            onClick={onScan}
            className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-brand-100/80 transition-colors hover:border-gold-400/60 hover:text-gold-400"
          >
            Scan QR
          </button>
        )}

        <Link
          to="/admin"
          className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-medium uppercase tracking-wider text-brand-100/80 transition-colors hover:border-gold-400/60 hover:text-gold-400"
        >
          Admin
        </Link>

        {onToggleOrder && (
          <button
            type="button"
            onClick={onToggleOrder}
            className="relative flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-brand-500 lg:hidden"
          >
            My Order
            {orderCount > 0 && (
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-navy-950">
                {orderCount}
              </span>
            )}
          </button>
        )}
      </nav>

      {menuOpen && (
        <div className="animate-fade-in space-y-1 border-t border-white/10 bg-navy-950 px-4 py-3 sm:hidden">
          {onScan && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onScan();
              }}
              className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-100/90 transition-colors hover:bg-white/5 hover:text-gold-400"
            >
              Scan Room QR Code
            </button>
          )}
          <Link
            to="/admin"
            onClick={() => setMenuOpen(false)}
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-brand-100/90 transition-colors hover:bg-white/5 hover:text-gold-400"
          >
            Admin
          </Link>
        </div>
      )}
    </header>
  );
}
