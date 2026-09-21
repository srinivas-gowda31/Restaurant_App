import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import {
  fetchAdminMenuItems,
  fetchAdminSpaServices,
  updateMenuItem,
  updateSpaService,
} from "../services/api.js";

export default function MenuManagement({ type }) {
  const isSpa = type === "spa";
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});

  const load = () => {
    const fetcher = isSpa ? fetchAdminSpaServices : fetchAdminMenuItems;
    fetcher()
      .then((data) => setRows(isSpa ? data.services : data.items))
      .catch((err) => setError(err.message));
  };

  useEffect(load, [isSpa]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };

  const saveEdit = async () => {
    const updater = isSpa ? updateSpaService : updateMenuItem;
    await updater(editingId, draft);
    setEditingId(null);
    load();
  };

  const toggleActive = async (row) => {
    const updater = isSpa ? updateSpaService : updateMenuItem;
    await updater(row.id, { isActive: !row.isActive });
    load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <LoadingSpinner size="lg" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Category</th>
            {isSpa ? <th className="px-4 py-3">Duration</th> : <th className="px-4 py-3">Veg</th>}
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
                    <input
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      className="w-full rounded border border-brand-200 px-2 py-1"
                    />
                  ) : (
                    row.category
                  )}
                </td>
                <td className="px-4 py-2">
                  {isSpa
                    ? isEditing
                      ? (
                        <input
                          type="number"
                          value={draft.durationMin || ""}
                          onChange={(e) => setDraft((d) => ({ ...d, durationMin: Number(e.target.value) }))}
                          className="w-20 rounded border border-brand-200 px-2 py-1"
                        />
                      )
                      : `${row.durationMin || "-"} min`
                    : isEditing
                      ? (
                        <input
                          type="checkbox"
                          checked={!!draft.vegetarian}
                          onChange={(e) => setDraft((d) => ({ ...d, vegetarian: e.target.checked }))}
                        />
                      )
                      : row.vegetarian ? "Veg" : "Non-veg"}
                </td>
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
  );
}
