import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchFrontDeskAlerts, updateFrontDeskAlertStatus } from "../services/api.js";

const STATUS_OPTIONS = ["open", "acknowledged", "resolved"];

const STATUS_STYLE = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-gold-400/20 text-gold-500",
  resolved: "bg-green-100 text-green-700",
};

export default function FrontDeskAlerts() {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    fetchFrontDeskAlerts()
      .then((data) => setAlerts(data.alerts))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const changeStatus = async (id, status) => {
    await updateFrontDeskAlertStatus(id, status);
    load();
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!alerts) return <LoadingSpinner size="lg" />;

  const openCount = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="space-y-3">
      {openCount > 0 && (
        <p className="text-sm font-medium text-red-600">
          {openCount} open alert{openCount === 1 ? "" : "s"} need attention.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Urgency</th>
              <th className="px-4 py-3">Reported</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-b border-brand-50 last:border-0">
                <td className="px-4 py-2">
                  {a.issue}
                  {a.agentNote && <p className="text-xs italic text-navy-950/50">{a.agentNote}</p>}
                </td>
                <td className="px-4 py-2">{a.roomNumber || "-"}</td>
                <td className="px-4 py-2">
                  {a.urgency === "urgent" ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Urgent</span>
                  ) : (
                    "Normal"
                  )}
                </td>
                <td className="px-4 py-2">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <select
                    value={a.status}
                    onChange={(e) => changeStatus(a.id, e.target.value)}
                    className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${STATUS_STYLE[a.status] || "bg-navy-100"}`}
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
        {alerts.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No front desk alerts.</p>}
      </div>
    </div>
  );
}
