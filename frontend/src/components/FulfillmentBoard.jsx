import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchFulfillment, updateFulfillmentStatus } from "../services/api.js";

const DEPARTMENTS = [
  { id: "kitchen", label: "Kitchen" },
  { id: "housekeeping", label: "Housekeeping" },
  { id: "spa", label: "Spa" },
  { id: "library", label: "Library" },
];

const STATUS_OPTIONS = ["pending", "in_progress", "completed"];

const STATUS_STYLE = {
  pending: "bg-gold-400/20 text-gold-500",
  in_progress: "bg-brand-100 text-brand-600",
  completed: "bg-green-100 text-green-700",
};

export default function FulfillmentBoard() {
  const [department, setDepartment] = useState("kitchen");
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    fetchFulfillment(department)
      .then((data) => setTickets(data.tickets))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    setTickets(null);
    load();
  }, [department]);

  const changeStatus = async (id, status) => {
    await updateFulfillmentStatus(department, id, status);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-lg bg-brand-50 p-1 text-sm">
        {DEPARTMENTS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDepartment(d.id)}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              department === d.id ? "bg-white text-brand-600 shadow-sm" : "text-navy-950/60 hover:text-navy-950"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!tickets ? (
        <LoadingSpinner size="lg" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-b border-brand-50 last:border-0">
                  <td className="px-4 py-2">{t.itemName}</td>
                  <td className="px-4 py-2">{t.quantity}</td>
                  <td className="px-4 py-2">{t.roomNumber || "-"}</td>
                  <td className="px-4 py-2">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <select
                      value={t.status}
                      onChange={(e) => changeStatus(t.id, e.target.value)}
                      className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_STYLE[t.status] || "bg-navy-100"}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tickets.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-navy-950/50">No {department} requests yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
