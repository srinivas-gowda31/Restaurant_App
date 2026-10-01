import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchConciergeRequests, updateConciergeRequestStatus } from "../services/api.js";

const STATUS_OPTIONS = ["open", "in_progress", "resolved"];

const STATUS_STYLE = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-gold-400/20 text-gold-500",
  resolved: "bg-green-100 text-green-700",
};

const CATEGORY_LABEL = {
  transportation: "Transportation",
  tour: "Tour / Sightseeing",
  reservation: "Outside Reservation",
  currency_exchange: "Currency Exchange",
  courier: "Courier",
  other: "Other",
};

export default function ConciergeRequests() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    fetchConciergeRequests()
      .then((data) => setRequests(data.requests))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const changeStatus = async (id, status) => {
    await updateConciergeRequestStatus(id, status);
    load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!requests) return <LoadingSpinner size="lg" />;

  const openCount = requests.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-3">
      {openCount > 0 && (
        <p className="text-sm font-medium text-red-600">
          {openCount} open request{openCount === 1 ? "" : "s"} need attention.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Urgency</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-brand-50 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap font-medium text-navy-950">
                  {CATEGORY_LABEL[r.category] || r.category}
                </td>
                <td className="px-4 py-2">
                  {r.details}
                  {r.agentNote && <p className="text-xs italic text-navy-950/50">{r.agentNote}</p>}
                </td>
                <td className="px-4 py-2">{r.roomNumber || "-"}</td>
                <td className="px-4 py-2">
                  {r.urgency === "urgent" ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Urgent</span>
                  ) : (
                    "Normal"
                  )}
                </td>
                <td className="px-4 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <select
                    value={r.status}
                    onChange={(e) => changeStatus(r.id, e.target.value)}
                    className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_STYLE[r.status] || "bg-navy-100"}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No concierge requests.</p>}
      </div>
    </div>
  );
}
