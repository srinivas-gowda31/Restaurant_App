import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import {
  fetchAdminMenuItems,
  fetchAdminSpaServices,
  fetchAdminHousekeepingItems,
  fetchAdminLibraryItems,
  updateMenuItem,
  updateSpaService,
  updateHousekeepingItem,
  updateLibraryItem,
  createMenuItem,
  createSpaService,
  createHousekeepingItem,
  createLibraryItem,
} from "../services/api.js";

// Kept in sync with backend/src/menuCategories.js — food items are classified into
// exactly these four sections so they stay easy to browse and extract consistently.
export const MENU_CATEGORIES = ["Starters", "Main Course", "Desserts", "Beverages"];

// Kept in sync with backend/src/cuisines.js — lets guests filter search_menu by cuisine.
export const CUISINES = ["Indian", "Chinese", "Continental"];

const TYPE_CONFIG = {
  menu: {
    label: "Item",
    listKey: "items",
    fetcher: fetchAdminMenuItems,
    creator: createMenuItem,
    updater: updateMenuItem,
    extraField: "vegetarian",
    extraColumnLabel: "Veg",
    namePlaceholder: "e.g. Paneer Tikka",
    categoryPlaceholder: "Mains",
    categoryOptions: MENU_CATEGORIES,
    cuisineOptions: CUISINES,
  },
  spa: {
    label: "Service",
    listKey: "services",
    fetcher: fetchAdminSpaServices,
    creator: createSpaService,
    updater: updateSpaService,
    extraField: "durationMin",
    extraColumnLabel: "Duration",
    namePlaceholder: "e.g. Deep Tissue Massage",
    categoryPlaceholder: "Massage",
  },
  housekeeping: {
    label: "Item",
    listKey: "items",
    fetcher: fetchAdminHousekeepingItems,
    creator: createHousekeepingItem,
    updater: updateHousekeepingItem,
    extraField: null,
    extraColumnLabel: null,
    namePlaceholder: "e.g. Water Bottle",
    categoryPlaceholder: "Amenities",
  },
  library: {
    label: "Book",
    listKey: "items",
    fetcher: fetchAdminLibraryItems,
    creator: createLibraryItem,
    updater: updateLibraryItem,
    extraField: "author",
    extraColumnLabel: "Author",
    namePlaceholder: "e.g. The Great Gatsby",
    categoryPlaceholder: "Fiction",
  },
};

const EMPTY_DRAFT = { name: "", category: "", cuisine: "", price: "", description: "", vegetarian: true, durationMin: "", author: "" };

export default function MenuManagement({ type }) {
  const config = TYPE_CONFIG[type];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_DRAFT);
  const [addError, setAddError] = useState(null);

  const load = () => {
    config
      .fetcher()
      .then((data) => setRows(data[config.listKey]))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [type]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };

  const saveEdit = async () => {
    await config.updater(editingId, draft);
    setEditingId(null);
    load();
  };

  const toggleActive = async (row) => {
    await config.updater(row.id, { isActive: !row.isActive });
    load();
  };

  const submitNewItem = async (e) => {
    e.preventDefault();
    if (!newItem.name.trim() || (config.extraField !== "author" && !newItem.price)) {
      setAddError("Name and price are required.");
      return;
    }
    setAddError(null);
    try {
      const extra = {};
      if (config.extraField === "vegetarian") extra.vegetarian = newItem.vegetarian;
      if (config.extraField === "durationMin") extra.durationMin = newItem.durationMin ? Number(newItem.durationMin) : undefined;
      if (config.extraField === "author") extra.author = newItem.author.trim() || undefined;

      if (config.cuisineOptions) extra.cuisine = newItem.cuisine;

      await config.creator({
        name: newItem.name.trim(),
        category: newItem.category.trim() || "Other",
        price: Number(newItem.price) || 0,
        description: newItem.description.trim(),
        ...extra,
      });
      setNewItem(EMPTY_DRAFT);
      setIsAdding(false);
      load();
    } catch (err) {
      setAddError(err.message);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <LoadingSpinner size="lg" />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (!isAdding) {
              setNewItem({ ...EMPTY_DRAFT, category: config.categoryOptions?.[0] || "", cuisine: config.cuisineOptions?.[0] || "" });
            }
            setIsAdding((v) => !v);
          }}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
        >
          {isAdding ? "Cancel" : `+ Add ${config.label}`}
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={submitNewItem}
          className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Name</label>
            <input
              value={newItem.name}
              onChange={(e) => setNewItem((d) => ({ ...d, name: e.target.value }))}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              placeholder={config.namePlaceholder}
            />
          </div>
          <div className="min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Category</label>
            {config.categoryOptions ? (
              <select
                value={newItem.category}
                onChange={(e) => setNewItem((d) => ({ ...d, category: e.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              >
                {config.categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={newItem.category}
                onChange={(e) => setNewItem((d) => ({ ...d, category: e.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
                placeholder={config.categoryPlaceholder}
              />
            )}
          </div>

          {config.cuisineOptions && (
            <div className="min-w-[120px]">
              <label className="mb-1 block text-xs font-medium text-navy-950/70">Cuisine</label>
              <select
                value={newItem.cuisine}
                onChange={(e) => setNewItem((d) => ({ ...d, cuisine: e.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              >
                {config.cuisineOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          {config.extraField === "durationMin" && (
            <div className="w-24">
              <label className="mb-1 block text-xs font-medium text-navy-950/70">Duration (min)</label>
              <input
                type="number"
                value={newItem.durationMin}
                onChange={(e) => setNewItem((d) => ({ ...d, durationMin: e.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              />
            </div>
          )}
          {config.extraField === "vegetarian" && (
            <div className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                id="newItemVeg"
                checked={newItem.vegetarian}
                onChange={(e) => setNewItem((d) => ({ ...d, vegetarian: e.target.checked }))}
              />
              <label htmlFor="newItemVeg" className="text-sm text-navy-950/70">Vegetarian</label>
            </div>
          )}
          {config.extraField === "author" && (
            <div className="min-w-[120px]">
              <label className="mb-1 block text-xs font-medium text-navy-950/70">Author</label>
              <input
                value={newItem.author}
                onChange={(e) => setNewItem((d) => ({ ...d, author: e.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
                placeholder="Optional"
              />
            </div>
          )}

          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Price (₹)</label>
            <input
              type="number"
              value={newItem.price}
              onChange={(e) => setNewItem((d) => ({ ...d, price: e.target.value }))}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              placeholder="0 = free"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Description</label>
            <input
              value={newItem.description}
              onChange={(e) => setNewItem((d) => ({ ...d, description: e.target.value }))}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            Save
          </button>
          {addError && <p className="w-full text-xs text-red-600">{addError}</p>}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              {config.cuisineOptions && <th className="px-4 py-3">Cuisine</th>}
              {config.extraColumnLabel && <th className="px-4 py-3">{config.extraColumnLabel}</th>}
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} className="border-b border-brand-50 last:border-0">
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        className="w-full rounded border border-brand-200 px-2 py-1"
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      config.categoryOptions ? (
                        <select
                          value={draft.category}
                          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                          className="w-full rounded border border-brand-200 px-2 py-1"
                        >
                          {config.categoryOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={draft.category}
                          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                          className="w-full rounded border border-brand-200 px-2 py-1"
                        />
                      )
                    ) : (
                      row.category
                    )}
                  </td>
                  {config.cuisineOptions && (
                    <td className="px-4 py-2">
                      {isEditing ? (
                        <select
                          value={draft.cuisine || ""}
                          onChange={(e) => setDraft((d) => ({ ...d, cuisine: e.target.value }))}
                          className="w-full rounded border border-brand-200 px-2 py-1"
                        >
                          {config.cuisineOptions.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.cuisine || "-"
                      )}
                    </td>
                  )}
                  {config.extraColumnLabel && (
                    <td className="px-4 py-2">
                      {config.extraField === "durationMin" &&
                        (isEditing ? (
                          <input
                            type="number"
                            value={draft.durationMin || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, durationMin: Number(e.target.value) }))}
                            className="w-20 rounded border border-brand-200 px-2 py-1"
                          />
                        ) : (
                          `${row.durationMin || "-"} min`
                        ))}
                      {config.extraField === "vegetarian" &&
                        (isEditing ? (
                          <input
                            type="checkbox"
                            checked={!!draft.vegetarian}
                            onChange={(e) => setDraft((d) => ({ ...d, vegetarian: e.target.checked }))}
                          />
                        ) : row.vegetarian ? (
                          "Veg"
                        ) : (
                          "Non-veg"
                        ))}
                      {config.extraField === "author" &&
                        (isEditing ? (
                          <input
                            value={draft.author || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, author: e.target.value }))}
                            className="w-full rounded border border-brand-200 px-2 py-1"
                          />
                        ) : (
                          row.author || "-"
                        ))}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        type="number"
                        value={draft.price}
                        onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                        className="w-24 rounded border border-brand-200 px-2 py-1"
                      />
                    ) : (
                      `₹${row.price}`
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${row.isActive ? "bg-green-100 text-green-700" : "bg-navy-100 text-navy-950/50"}`}>
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEdit} className="text-brand-600 hover:underline">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-navy-950/50 hover:underline">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(row)} className="text-brand-600 hover:underline">
                          Edit
                        </button>
                        <button type="button" onClick={() => toggleActive(row)} className="text-navy-950/50 hover:underline">
                          {row.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No items yet.</p>}
      </div>
    </div>
  );
}
