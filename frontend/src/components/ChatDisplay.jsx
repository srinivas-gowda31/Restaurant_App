import { useEffect, useRef } from "react";
import MessageItem from "./MessageItem.jsx";
import LoadingSpinner from "./LoadingSpinner.jsx";

export default function ChatDisplay({ messages, isBusy, onAddItem }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isBusy]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-3">
      {messages.map((m) => (
        <MessageItem key={m.id} role={m.role} content={m.content} itemsTable={m.itemsTable} onAddItem={onAddItem} />
      ))}
      {isBusy && (
        <div className="flex justify-start animate-fade-in">
          <div className="rounded-2xl rounded-bl-sm bg-white border border-brand-100 px-4 py-2.5 shadow-sm">
            <LoadingSpinner />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
