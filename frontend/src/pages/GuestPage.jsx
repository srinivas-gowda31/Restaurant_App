import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";
import ChatDisplay from "../components/ChatDisplay.jsx";
import VoiceInput from "../components/VoiceInput.jsx";
import TextInput from "../components/TextInput.jsx";
import OrderPanel from "../components/OrderPanel.jsx";
import WelcomeCard from "../components/WelcomeCard.jsx";
import LiveVoiceButton from "../components/LiveVoiceButton.jsx";
import { useOrder } from "../hooks/useOrder.js";
import { useChat } from "../hooks/useChat.js";
import { useVoice } from "../hooks/useVoice.js";
import { useRealtimeVoice } from "../hooks/useRealtimeVoice.js";

export default function GuestPage() {
  const navigate = useNavigate();
  const order = useOrder();
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(false);

  const handleUiHints = useCallback(
    (uiHints) => {
      uiHints.cartActions?.forEach((action) => order.applyCartAction(action));
      if (uiHints.orderId) {
        order.markConfirmed(uiHints.orderId);
        navigate(`/confirmation/${uiHints.orderId}`);
      }
    },
    [order, navigate]
  );

  const chat = useChat({ onUiHints: handleUiHints });
  const voice = useVoice({ onTurnComplete: chat.receiveVoiceTurn });
  const liveVoice = useRealtimeVoice({
    onTranscript: (role, text) => chat.addMessage(role, text),
    onUiHints: handleUiHints,
  });

  const handleConfirmOrder = () => {
    const summary = order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ");
    chat.sendMessage(`Please confirm my order: ${summary}. That's everything, please place the order now.`);
  };

  const isBusy = chat.isSending || voice.isProcessing;

  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <Header onToggleOrder={() => setIsOrderPanelOpen(true)} orderCount={order.items.length} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 lg:border-x lg:border-brand-100">
        <main className="flex flex-1 flex-col">
          {chat.messages.length === 0 ? (
            <WelcomeCard onSuggestion={chat.sendMessage} />
          ) : (
            <ChatDisplay messages={chat.messages} isBusy={isBusy} onAddItem={order.applyCartAction} />
          )}

          {voice.error && <p className="px-4 pb-1 text-xs text-red-600">{voice.error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-brand-100 bg-white px-4 py-3">
            <div className="flex flex-1 items-center gap-2">
              <VoiceInput
                isRecording={voice.isRecording}
                isProcessing={voice.isProcessing}
                onToggle={voice.toggleRecording}
              />
              <TextInput onSend={chat.sendMessage} disabled={isBusy} />
            </div>
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
    </div>
  );
}
