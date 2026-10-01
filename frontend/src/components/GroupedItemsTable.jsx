// The menu schema only distinguishes breakfast / snack (booleans) and category (Starters,
// Main Course, Desserts, Beverages) — there's no separate lunch/dinner flag, since a main
// course here is served at both. Everything that isn't breakfast or a snack is grouped under
// one "Lunch & Dinner Menu" section instead of inventing a split the data doesn't have.
const MEAL_GROUPS = [
  { key: "breakfast", label: "Breakfast", test: (item) => item.breakfast },
  { key: "snacks", label: "Snacks", test: (item) => !item.breakfast && item.snack },
  { key: "menu", label: "Lunch & Dinner Menu", test: (item) => !item.breakfast && !item.snack },
];

function groupByCuisine(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.cuisine || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()];
}

function VegBadge({ vegetarian }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-navy-950/70">
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${vegetarian ? "bg-emerald-500" : "bg-rose-500"}`}
        aria-hidden="true"
      />
      {vegetarian ? "Veg" : "Non-veg"}
    </span>
  );
}

// The second column means something different per catalog — menu items have a real veg/non-veg
// flag, spa services have a duration, but library books and housekeeping amenities have neither.
// Confirmed live: a book showing a "Non-veg" badge (vegetarian is simply undefined for
// LibraryItem, which read as falsy) was a real, visible bug — genre is what actually belongs
// there for a book; housekeeping just shows its category, same reasoning.
const SECOND_COLUMN = {
  menu: { label: "Type", render: (item) => <VegBadge vegetarian={item.vegetarian} /> },
  spa: {
    label: "Duration",
    render: (item) => (
      <span className="text-xs font-medium text-navy-950/70">{item.durationMin ? `${item.durationMin} min` : "—"}</span>
    ),
  },
  library: {
    label: "Genre",
    render: (item) => <span className="text-xs font-medium text-navy-950/70">{item.category || "—"}</span>,
  },
  housekeeping: {
    label: "Category",
    render: (item) => <span className="text-xs font-medium text-navy-950/70">{item.category || "—"}</span>,
  },
};

function ItemRow({ item, type, onAddItem, isLast }) {
  const secondColumn = SECOND_COLUMN[type] || SECOND_COLUMN.menu;
  return (
    <tr className={`group transition-colors hover:bg-brand-50/60 ${isLast ? "" : "border-b border-brand-50"}`}>
      <td className="px-3.5 py-2.5 align-top">
        <div className="text-sm font-medium leading-snug text-navy-950">{item.name}</div>
        {item.author && <div className="text-xs leading-snug text-navy-950/50">by {item.author}</div>}
        {item.description && (
          <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-navy-950/50">{item.description}</div>
        )}
      </td>
      <td className="whitespace-nowrap px-3.5 py-2.5 align-top">{secondColumn.render(item)}</td>
      <td className="whitespace-nowrap px-3.5 py-2.5 text-right align-top font-serif text-sm font-semibold text-navy-950">
        ₹{item.price}
      </td>
      {onAddItem && (
        <td className="whitespace-nowrap px-3.5 py-2.5 text-right align-top">
          <button
            type="button"
            onClick={() => onAddItem({ name: item.name, quantity: 1, unitPrice: item.price })}
            className="rounded-full bg-navy-950 px-3.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
          >
            Add
          </button>
        </td>
      )}
    </tr>
  );
}

function ItemTable({ items, type, onAddItem }) {
  const secondColumnLabel = (SECOND_COLUMN[type] || SECOND_COLUMN.menu).label;
  return (
    <table className="w-full min-w-[380px] text-left">
      <thead>
        <tr className="border-b border-brand-100 bg-white/60">
          <th className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-950/40">Item</th>
          <th className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-950/40">
            {secondColumnLabel}
          </th>
          <th className="px-3.5 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wide text-navy-950/40">
            Price
          </th>
          {onAddItem && <th className="px-3.5 py-1.5" aria-hidden="true" />}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <ItemRow key={item.id || item.name} item={item} type={type} onAddItem={onAddItem} isLast={i === items.length - 1} />
        ))}
      </tbody>
    </table>
  );
}

function MoreResultsNote({ items, totalMatches }) {
  if (!(typeof totalMatches === "number" && totalMatches > items.length)) return null;
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-navy-950/60">
      Showing {items.length} of {totalMatches} — ask to narrow it down (e.g. by cuisine or veg/non-veg) to see more.
    </div>
  );
}

export default function GroupedItemsTable({ itemsTable, onAddItem }) {
  const { type, items, totalMatches } = itemsTable;
  if (!items || items.length === 0) return null;

  const isMenu = type === "menu";

  // Spa/housekeeping/library results have no breakfast/snack/cuisine fields to group by —
  // same flat single table as before, just the more polished ItemTable underneath.
  if (!isMenu) {
    return (
      <div className="mt-2 space-y-2">
        <MoreResultsNote items={items} totalMatches={totalMatches} />
        <div className="overflow-hidden rounded-xl border border-brand-100 shadow-sm">
          <div className="overflow-x-auto">
            <ItemTable items={items} type={type} onAddItem={onAddItem} />
          </div>
        </div>
      </div>
    );
  }

  const mealGroups = MEAL_GROUPS.map((g) => ({ ...g, items: items.filter(g.test) })).filter((g) => g.items.length > 0);

  return (
    <div className="mt-2 space-y-3">
      <MoreResultsNote items={items} totalMatches={totalMatches} />
      {mealGroups.map((group) => (
        <div key={group.key} className="overflow-hidden rounded-xl border border-brand-100 shadow-sm">
          <div className="flex items-center gap-2 border-b border-gold-500/30 bg-navy-950 px-3.5 py-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" aria-hidden="true" />
            <span className="font-serif text-sm font-semibold tracking-wide text-white">{group.label}</span>
          </div>
          {groupByCuisine(group.items).map(([cuisine, cuisineItems], idx) => (
            <div key={cuisine} className={idx > 0 ? "border-t border-brand-100" : ""}>
              <div className="bg-brand-50/70 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-950/50">
                {cuisine}
              </div>
              <div className="overflow-x-auto">
                <ItemTable items={cuisineItems} type="menu" onAddItem={onAddItem} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
