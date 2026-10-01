import { useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import AdminLoginGate from "../components/AdminLoginGate.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import UploadForm from "../components/UploadForm.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import MenuManagement from "../components/MenuManagement.jsx";
import RoomsManagement from "../components/RoomsManagement.jsx";
import OrdersTable from "../components/OrdersTable.jsx";
import FulfillmentBoard from "../components/FulfillmentBoard.jsx";
import FrontDeskAlerts from "../components/FrontDeskAlerts.jsx";
import ConciergeRequests from "../components/ConciergeRequests.jsx";
import { fetchUploads, fetchAdminHotel } from "../services/api.js";

const TABS = [
  { id: "uploads", label: "Uploads" },
  { id: "rooms", label: "Rooms" },
  { id: "menu", label: "Menu" },
  { id: "spa", label: "Spa Services" },
  { id: "housekeeping", label: "Housekeeping" },
  { id: "library", label: "Library" },
  { id: "orders", label: "Orders" },
  { id: "fulfillment", label: "Fulfillment" },
  { id: "frontdesk", label: "Front Desk" },
  { id: "concierge", label: "Concierge" },
];

function UploadsTab() {
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const load = () => {
    fetchUploads()
      .then((data) => setUploads(data.uploads))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const handleExtracted = (upload, extraction) => {
    setReviewing({ upload, items: extraction.items || [] });
    load();
  };

  const openExisting = (upload) => {
    if (upload.status !== "pending_review") return;
    const items = JSON.parse(upload.rawExtractionJson || "{}").items || [];
    setReviewing({ upload, items });
  };

  return (
    <div className="space-y-4">
      <UploadForm onExtracted={handleExtracted} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!uploads ? (
        <LoadingSpinner size="lg" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b border-brand-50 last:border-0">
                  <td className="px-4 py-2">{u.fileName}</td>
                  <td className="px-4 py-2 capitalize">{u.type}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : u.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-gold-400/20 text-gold-500"
                      }`}
                    >
                      {u.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2">{new Date(u.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {u.status === "pending_review" && (
                      <button type="button" onClick={() => openExisting(u)} className="text-brand-600 hover:underline">
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {uploads.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No uploads yet.</p>}
        </div>
      )}

      {reviewing && (
        <ReviewModal
          upload={reviewing.upload}
          initialItems={reviewing.items}
          onClose={() => setReviewing(null)}
          onResolved={() => {
            setReviewing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const TAB_ICONS = {
  uploads: "⇪",
  rooms: "🛏",
  menu: "🍽",
  spa: "💆",
  housekeeping: "🧹",
  library: "📖",
  orders: "🧾",
  fulfillment: "🛎",
  frontdesk: "🔔",
  concierge: "🧳",
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("uploads");
  const [hotelName, setHotelName] = useState(null);
  const activeLabel = TABS.find((t) => t.id === activeTab)?.label;

  // Runs on initial mount (works fine for a returning admin whose key is already saved) AND
  // whenever AdminLoginGate reports a fresh login — a first-time login has no key yet on mount,
  // so this effect's initial call would otherwise 401 and never get a real chance to retry.
  const loadHotel = () => {
    fetchAdminHotel()
      .then((data) => setHotelName(data.hotel?.name || null))
      .catch(() => {
        // Non-fatal — the dashboard just omits the hotel name if this fails.
      });
  };
  useEffect(loadHotel, []);

  return (
    <AdminLoginGate onUnlock={loadHotel}>
      <div className="min-h-screen bg-brand-50">
        <Header hotelName={hotelName} />

        <div className="border-b border-white/10 bg-navy-950 text-white">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold-400/90">
              Back of House{hotelName ? ` — ${hotelName}` : ""}
            </span>
            <h1 className="mt-1.5 font-serif text-2xl font-bold sm:text-3xl">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-white/60">Manage menus, rooms, orders and guest requests.</p>
          </div>
        </div>

        <div className="sticky top-0 z-20 border-b border-brand-100 bg-white/95 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 scrollbar-thin sm:px-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-navy-950 text-white shadow-sm"
                    : "bg-brand-50 text-navy-950/60 hover:bg-brand-100 hover:text-navy-950"
                }`}
              >
                <span aria-hidden="true">{TAB_ICONS[tab.id]}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-6">
            <h2 className="mb-4 font-serif text-lg font-bold text-navy-950">{activeLabel}</h2>

            {activeTab === "uploads" && <UploadsTab />}
            {activeTab === "rooms" && <RoomsManagement />}
            {activeTab === "menu" && <MenuManagement type="menu" />}
            {activeTab === "spa" && <MenuManagement type="spa" />}
            {activeTab === "housekeeping" && <MenuManagement type="housekeeping" />}
            {activeTab === "library" && <MenuManagement type="library" />}
            {activeTab === "orders" && <OrdersTable />}
            {activeTab === "fulfillment" && <FulfillmentBoard />}
            {activeTab === "frontdesk" && <FrontDeskAlerts />}
            {activeTab === "concierge" && <ConciergeRequests />}
          </div>
        </main>
      </div>
    </AdminLoginGate>
  );
}
