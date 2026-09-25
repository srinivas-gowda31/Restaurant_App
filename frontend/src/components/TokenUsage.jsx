import { useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchTokenUsage } from "../services/api.js";

function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-navy-950/50">{label}</p>
      <p className="mt-1 font-serif text-2xl font-bold text-navy-950">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-950/50">{hint}</p>}
    </div>
  );
}

const SOURCE_LABEL = { chat: "Text Chat", voice: "Voice" };

export default function TokenUsage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTokenUsage()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <LoadingSpinner size="lg" />;

  const { summary, bySource, daily } = data;
  const maxDailyTokens = Math.max(1, ...daily.map((d) => d.tokens));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Conversations" value={summary.totalConversations.toLocaleString()} />
        <StatTile label="Total Tokens" value={summary.totalTokens.toLocaleString()} />
        <StatTile
          label="Avg Tokens / Conversation"
          value={summary.avgTokensPerConversation.toLocaleString()}
        />
        <StatTile
          label="Avg Tokens / Minute"
          value={summary.avgTokensPerMinute.toLocaleString()}
          hint="Across each session's active span"
        />
        <StatTile
          label="Prompt / Completion"
          value={`${summary.totalPromptTokens.toLocaleString()} / ${summary.totalCompletionTokens.toLocaleString()}`}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Conversations</th>
              <th className="px-4 py-3">API Calls</th>
              <th className="px-4 py-3">Total Tokens</th>
              <th className="px-4 py-3">Avg Tokens / Conversation</th>
              <th className="px-4 py-3">Avg Tokens / Minute</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map((row) => (
              <tr key={row.source} className="border-b border-brand-50 last:border-0">
                <td className="px-4 py-2">{SOURCE_LABEL[row.source] || row.source}</td>
                <td className="px-4 py-2">{row.conversations.toLocaleString()}</td>
                <td className="px-4 py-2">{row.calls.toLocaleString()}</td>
                <td className="px-4 py-2">{row.totalTokens.toLocaleString()}</td>
                <td className="px-4 py-2">{row.avgTokensPerConversation.toLocaleString()}</td>
                <td className="px-4 py-2">{row.avgTokensPerMinute.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bySource.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-navy-950/50">No conversations tracked yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-brand-100 bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-navy-950/50">Last 14 Days</p>
        {daily.length === 0 ? (
          <p className="text-sm text-navy-950/50">No activity in this window.</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5">
            {daily.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.tokens} tokens`}>
                <div
                  className="w-full rounded-t bg-brand-400"
                  style={{ height: `${Math.max(4, (d.tokens / maxDailyTokens) * 100)}%` }}
                />
                <span className="text-[10px] text-navy-950/40">
                  {new Date(d.day).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
