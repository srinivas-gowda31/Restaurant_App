import { useEffect, useRef } from "react";
import GroupedItemsTable from "./GroupedItemsTable.jsx";

export default function LiveTranscript({ messages, onAddItem }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
      {messages.map((m) => (
        <div key={m.id} className={`flex animate-fade-in ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
              m.itemsTable ? "max-w-full sm:max-w-[95%]" : "max-w-[85%]"
            } ${
              m.role === "user"
                ? "bg-brand-600 text-white rounded-br-sm"
                : "bg-white text-navy-950 rounded-bl-sm border border-brand-100"
            }`}
          >
            {m.content}
            {m.role === "assistant" && m.itemsTable && (
              <GroupedItemsTable itemsTable={m.itemsTable} onAddItem={onAddItem} />
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
