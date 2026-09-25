import { useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { uploadMenuFile, uploadExcelFile } from "../services/api.js";

const MODES = {
  ai: {
    label: "AI Extraction (PDF/Image)",
    accept: "application/pdf,image/*",
    hint: "File (PDF or image)",
    action: uploadMenuFile,
    submitLabel: "Upload & Extract",
    loadingLabel: "Extracting...",
  },
  excel: {
    label: "Spreadsheet (Excel)",
    accept: ".xlsx,.xls",
    hint: "File (.xlsx) with columns: name, category, price, vegetarian/duration, description",
    action: uploadExcelFile,
    submitLabel: "Upload & Import",
    loadingLabel: "Importing...",
  },
};

export default function UploadForm({ onExtracted }) {
  const [mode, setMode] = useState("ai");
  const [file, setFile] = useState(null);
  const [type, setType] = useState("menu");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  const config = MODES[mode];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setError(null);
    try {
      const { upload, extraction } = await config.action(file, type);
      onExtracted(upload, extraction);
      setFile(null);
      e.target.reset();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4">
      <div className="mb-3 flex gap-1 rounded-lg bg-brand-50 p-1 text-sm">
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setFile(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
              mode === key ? "bg-white text-brand-600 shadow-sm" : "text-navy-950/60 hover:text-navy-950"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-navy-950/70">{config.hint}</label>
          <input
            type="file"
            accept={config.accept}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-navy-950/70">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-brand-200 px-3 py-2 text-sm"
          >
            <option value="menu">Menu</option>
            <option value="spa">Spa</option>
            <option value="housekeeping">Housekeeping</option>
            <option value="library">Library</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!file || isUploading}
          className="flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
        >
          {isUploading && <LoadingSpinner />}
          {isUploading ? config.loadingLabel : config.submitLabel}
        </button>

        {error && <p className="text-xs text-red-600 sm:ml-2">{error}</p>}
      </form>
    </div>
  );
}
