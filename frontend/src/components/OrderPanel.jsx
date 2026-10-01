export default function OrderPanel({
  items,
  total,
  confirmedTotal = 0,
  confirmedOrderCount = 0,
  onUpdateQuantity,
  onRemove,
  onConfirm,
  isOpen,
  onClose,
  disabled,
}) {
  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
        <h2 className="font-serif text-lg font-bold text-navy-950">My Order</h2>
        {onClose && (
          <button type="button" onClick={onClose} className="text-navy-950/60 hover:text-navy-950 lg:hidden" aria-label="Close order panel">
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-navy-950/50 py-8 text-center">Your order is empty. Ask the concierge to add something!</p>
        ) : (
          items.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-2 rounded-xl border border-brand-100 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy-950">{item.name}</p>
                <p className="text-xs text-navy-950/60">₹{item.unitPrice.toFixed(0)} each</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.name, item.quantity - 1)}
                  className="h-6 w-6 rounded-full border border-brand-200 text-navy-950 hover:bg-brand-50"
                  aria-label={`Decrease quantity of ${item.name}`}
                >
                  −
                </button>
                <span className="w-5 text-center text-sm">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.name, item.quantity + 1)}
                  className="h-6 w-6 rounded-full border border-brand-200 text-navy-950 hover:bg-brand-50"
                  aria-label={`Increase quantity of ${item.name}`}
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.name)}
                className="text-navy-950/40 hover:text-red-500"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-brand-100 px-4 py-3 space-y-3">
        {confirmedOrderCount > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
            <span>
              Confirmed this visit ({confirmedOrderCount} order{confirmedOrderCount > 1 ? "s" : ""})
            </span>
            <span className="font-medium">₹{confirmedTotal.toFixed(0)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-semibold text-navy-950">
          <span>{confirmedOrderCount > 0 ? "Current order" : "Total"}</span>
          <span>₹{total.toFixed(0)}</span>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          disabled={items.length === 0 || disabled}
          className="w-full rounded-full bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 font-semibold py-2.5 text-sm transition-colors"
        >
          Confirm Order
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:w-80 lg:shrink-0 lg:border-l lg:border-brand-100 lg:bg-brand-50/60">
        {content}
      </aside>

      {isOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/40" onClick={onClose} />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-white shadow-xl animate-fade-in">
            {content}
          </div>
        </div>
      )}
    </>
  );
}
