import { useCallback, useState } from "react";
import { sendChatMessage } from "../services/api.js";
import { getSessionId } from "./useSessionId.js";

export function useChat({ onUiHints } = {}) {
  const [sessionId] = useState(getSessionId);
  const [messages, setMessages] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);

  const addMessage = useCallback((role, content, extra = {}) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, role, content, ...extra }]);
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;

      addMessage("user", trimmed);
      setIsSending(true);
      setError(null);

      try {
        const { reply, uiHints } = await sendChatMessage(sessionId, trimmed);
        addMessage("assistant", reply, { itemsTable: uiHints?.itemsTable || null });
        if (uiHints) onUiHints?.(uiHints);
      } catch (err) {
        setError(err.message);
        addMessage("assistant", err.message || "Sorry, something went wrong. Please try again.");
      } finally {
        setIsSending(false);
      }
    },
    [sessionId, isSending, addMessage, onUiHints]
  );

  const receiveVoiceTurn = useCallback(
    ({ transcript, reply, uiHints }) => {
      addMessage("user", transcript);
      addMessage("assistant", reply, { itemsTable: uiHints?.itemsTable || null });
      if (uiHints) onUiHints?.(uiHints);
    },
    [addMessage, onUiHints]
  );

  const updateLastMessage = useCallback(
    (updates) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), { ...last, ...updates }];
      });
    },
    []
  );

  return { sessionId, messages, isSending, error, sendMessage, receiveVoiceTurn, addMessage, updateLastMessage };
}
