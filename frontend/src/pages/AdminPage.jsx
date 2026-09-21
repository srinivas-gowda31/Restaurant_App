import { useEffect, useState } from "react";
import Header from "../components/Header.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import UploadForm from "../components/UploadForm.jsx";
import ReviewModal from "../components/ReviewModal.jsx";
import MenuManagement from "../components/MenuManagement.jsx";
import OrdersTable from "../components/OrdersTable.jsx";
import { fetchUploads } from "../services/api.js";

const TABS = [
  { id: "uploads", label: "Uploads" },
  { id: "menu", label: "Menu" },
  { id: "spa", label: "Spa Services" },
  { id: "orders", label: "Orders" },
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

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("uploads");

  return (
    <div className="min-h-screen bg-brand-50">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="mb-4 font-serif text-2xl font-bold text-navy-950">Admin Dashboard</h1>

        <div className="mb-6 flex gap-1 border-b border-brand-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-brand-600 text-brand-600"
                  : "text-navy-950/60 hover:text-navy-950"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "uploads" && <UploadsTab />}
        {activeTab === "menu" && <MenuManagement type="menu" />}
        {activeTab === "spa" && <MenuManagement type="spa" />}
        {activeTab === "orders" && <OrdersTable />}
      </main>
    </div>
  );
}
