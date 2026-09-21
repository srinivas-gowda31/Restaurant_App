function ItemsTable({ itemsTable, onAddItem }) {
  const { type, items } = itemsTable;
  const isSpa = type === "spa";

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-brand-100">
      <table className="w-full min-w-[380px] text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-brand-100 bg-brand-50 text-navy-950/60">
            <th className="px-3 py-2 font-medium">Item</th>
            {isSpa ? (
              <th className="px-3 py-2 font-medium">Duration</th>
            ) : (
              <th className="px-3 py-2 font-medium">Type</th>
            )}
            <th className="px-3 py-2 font-medium">Price</th>
            {onAddItem && <th className="px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id || item.name} className="border-b border-brand-50 last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium text-navy-950">{item.name}</div>
                {item.description && <div className="text-navy-950/50">{item.description}</div>}
              </td>
              <td className="px-3 py-2 text-navy-950/70">
                {isSpa ? (item.durationMin ? `${item.durationMin} min` : "—") : item.vegetarian ? "Veg" : "Non-veg"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-navy-950">₹{item.price}</td>
              {onAddItem && (
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onAddItem({ type: "add", name: item.name, quantity: 1, unitPrice: item.price })}
                    className="rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500"
                  >
                    Add
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MessageItem({ role, content, itemsTable, onAddItem }) {
  const isUser = role === "user";
  return (
    <div className={`flex animate-fade-in ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-white text-navy-950 rounded-bl-sm border border-brand-100"
        }`}
      >
        {content}
        {!isUser && itemsTable && <ItemsTable itemsTable={itemsTable} onAddItem={onAddItem} />}
      </div>
    </div>
  );
}
