import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { approveUpload, rejectUpload } from "../services/api.js";

export default function ReviewModal({ upload, initialItems, onClose, onResolved }) {
  const [items, setItems] = useState(initialItems || []);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const isSpa = upload.type === "spa";

  const updateField = (index, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeRow = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApprove = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await approveUpload(upload.id, items);
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await rejectUpload(upload.id);
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/50 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-brand-100 px-5 py-3">
          <h2 className="font-serif text-lg font-bold text-navy-950">Review Extracted Items — {upload.fileName}</h2>
          <button type="button" onClick={onClose} className="text-navy-950/60 hover:text-navy-950" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto scrollbar-thin px-5 py-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-navy-950/50">
                <th className="pb-2 pr-2">Name</th>
                <th className="pb-2 pr-2">Category</th>
                {isSpa ? <th className="pb-2 pr-2">Duration (min)</th> : <th className="pb-2 pr-2">Veg</th>}
                <th className="pb-2 pr-2">Price (₹)</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-t border-brand-100">
                  <td className="py-2 pr-2">
                    <input
                      value={item.name || ""}
                      onChange={(e) => updateField(index, "name", e.target.value)}
                      className="w-full rounded border border-brand-200 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={item.category || ""}
                      onChange={(e) => updateField(index, "category", e.target.value)}
                      className="w-full rounded border border-brand-200 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    {isSpa ? (
                      <input
                        type="number"
                        value={item.durationMin || ""}
                        onChange={(e) => updateField(index, "durationMin", Number(e.target.value))}
                        className="w-20 rounded border border-brand-200 px-2 py-1"
                      />
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!item.vegetarian}
                        onChange={(e) => updateField(index, "vegetarian", e.target.checked)}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      value={item.price || ""}
                      onChange={(e) => updateField(index, "price", Number(e.target.value))}
                      className="w-24 rounded border border-brand-200 px-2 py-1"
                    />
                  </td>
                  <td className="py-2">
                    <button type="button" onClick={() => removeRow(index)} className="text-navy-950/40 hover:text-red-500" aria-label="Remove row">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="py-6 text-center text-sm text-navy-950/50">No items to review.</p>}
        </div>

        {error && <p className="px-5 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-brand-100 px-5 py-3">
          <button
            type="button"
            onClick={handleReject}
            disabled={isSaving}
            className="rounded-full border border-brand-200 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-brand-50 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSaving || items.length === 0}
            className="flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {isSaving && <LoadingSpinner />}
            Approve & Save
          </button>
        </div>
      </div>
    </div>
  );
}
