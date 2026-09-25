import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import ChatDisplay from "../components/ChatDisplay.jsx";
import TextInput from "../components/TextInput.jsx";
import OrderPanel from "../components/OrderPanel.jsx";
import WelcomeCard from "../components/WelcomeCard.jsx";
import LiveVoiceButton from "../components/LiveVoiceButton.jsx";
import QrScannerModal from "../components/QrScannerModal.jsx";
import { useOrder } from "../hooks/useOrder.js";
import { useChat } from "../hooks/useChat.js";
import { useRealtimeVoice } from "../hooks/useRealtimeVoice.js";
import { useGuestContext, parseRoomQrText } from "../hooks/useGuestContext.js";
import { resetSessionId } from "../hooks/useSessionId.js";

export default function GuestPage() {
  const navigate = useNavigate();
  const order = useOrder();
  const guestContext = useGuestContext();
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const chat = useChat({ guestContext });

  const handleScanDetected = useCallback((text) => {
    const parsed = parseRoomQrText(text);
    if (!parsed) {
      setIsScanning(false);
      return;
    }
    // A fresh full-page load — same as what happens on a real phone scan — so chat
    // history, the cart, and the session id all reset cleanly for the newly-scanned
    // guest instead of a same-tab state tweak that leaves stale conversation on screen.
    resetSessionId();
    const params = new URLSearchParams({ room: parsed.room });
    if (parsed.guestName) params.set("guest", parsed.guestName);
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  }, []);

  const handleUiHints = useCallback(
    (uiHints) => {
      uiHints.cartActions?.forEach((action) => order.applyCartAction(action));
      if (uiHints.itemsTable) {
        chat.updateLastMessage({ itemsTable: uiHints.itemsTable });
      }
      if (uiHints.orderId) {
        order.markConfirmed(uiHints.orderId);
        navigate(`/confirmation/${uiHints.orderId}`);
      }
    },
    [order, navigate, chat]
  );

  const liveVoice = useRealtimeVoice({
    onTranscript: (role, text) => chat.addMessage(role, text),
    onUiHints: handleUiHints,
    guestContext,
  });

  const handleConfirmOrder = () => {
    const summary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
    chat.sendMessage(`Please confirm my order: ${summary}. That's everything, please place the order now.`);
  };

  const isBusy = chat.isSending;

  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <Header
        onToggleOrder={() => setIsOrderPanelOpen(true)}
        orderCount={order.items.length}
        onScan={() => setIsScanning(true)}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 lg:border-x lg:border-brand-100">
        <main className="flex flex-1 flex-col">
          {chat.messages.length === 0 ? (
            <WelcomeCard
              onSuggestion={chat.sendMessage}
              guestName={guestContext.guestName}
              roomNumber={guestContext.roomNumber}
              onScan={() => setIsScanning(true)}
            />
          ) : (
            <ChatDisplay messages={chat.messages} isBusy={isBusy} onAddItem={order.applyCartAction} />
          )}

          {liveVoice.error && <p className="px-4 pb-1 text-xs text-red-600">{liveVoice.error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-brand-100 bg-white px-4 py-3">
            <TextInput onSend={chat.sendMessage} disabled={isBusy} />
            <LiveVoiceButton
              status={liveVoice.status}
              error={liveVoice.error}
              onStart={liveVoice.start}
              onStop={liveVoice.stop}
            />
          </div>
        </main>

        <OrderPanel
          items={order.items}
          total={order.total}
          onUpdateQuantity={order.updateQuantity}
          onRemove={order.removeItem}
          onConfirm={handleConfirmOrder}
          isOpen={isOrderPanelOpen}
          onClose={() => setIsOrderPanelOpen(false)}
          disabled={isBusy}
        />
      </div>

      {isScanning && <QrScannerModal onDetect={handleScanDetected} onClose={() => setIsScanning(false)} />}
    </div>
  );
}
