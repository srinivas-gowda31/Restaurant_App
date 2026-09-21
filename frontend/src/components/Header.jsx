import { Link } from "react-router-dom";

export default function Header({ onToggleOrder, orderCount = 0 }) {
  return (
    <header className="sticky top-0 z-20 bg-navy-950 text-white shadow-md">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-gold-400 font-serif text-xl font-bold">Baikal Sphere</span>
          <span className="hidden sm:inline text-sm text-brand-100/70">Hotel Concierge</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-brand-100/80 transition-colors hover:border-white/40 hover:text-white"
          >
            Admin
          </Link>

          {onToggleOrder && (
            <button
              type="button"
              onClick={onToggleOrder}
              className="relative flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-500 transition-colors px-4 py-2 text-sm font-medium lg:hidden"
            >
              My Order
              {orderCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-navy-950 text-xs font-bold">
                  {orderCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
