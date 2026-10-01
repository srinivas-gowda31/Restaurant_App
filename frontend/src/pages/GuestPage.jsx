import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import VoiceStage from "../components/VoiceStage.jsx";
import LiveTranscript from "../components/LiveTranscript.jsx";
import VoiceControlBar from "../components/VoiceControlBar.jsx";
import OrderPanel from "../components/OrderPanel.jsx";
import QrScannerModal from "../components/QrScannerModal.jsx";
import { useOrder } from "../hooks/useOrder.js";
import { useRealtimeVoice } from "../hooks/useRealtimeVoice.js";
import { useGuestContext, parseRoomQrText } from "../hooks/useGuestContext.js";
import { getSessionId, resetSessionId } from "../hooks/useSessionId.js";
import {
  addToCart,
  removeFromCart,
  setCartItemQuantity,
  confirmOrder as confirmOrderRequest,
  registerGuestSession,
  getSessionMessages,
  fetchHotelInfo,
} from "../services/api.js";

export default function GuestPage() {
  const order = useOrder();
  const guestContext = useGuestContext();
  const [sessionId] = useState(getSessionId);
  const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [dismissedOrderId, setDismissedOrderId] = useState(null);
  const [hotelName, setHotelName] = useState(null);

  useEffect(() => {
    fetchHotelInfo(guestContext?.hotel)
      .then((data) => setHotelName(data.hotel?.name || null))
      .catch(() => {
        // Non-fatal — Header/VoiceStage both fall back to the original single-hotel branding.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestContext?.hotel]);

  const addMessage = useCallback((role, content) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}_${Math.random()}`, role, content }]);
  }, []);

  const updateLastMessage = useCallback((updates) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, ...updates }];
    });
  }, []);

  useEffect(() => {
    // hotel alone (a bare visit to a specific hotel's own link, no scanned room) still needs to
    // register — without this, that guest's session silently fell back to the default hotel
    // instead of the one they actually navigated to.
    if (!guestContext?.roomNumber && !guestContext?.guestName && !guestContext?.hotel) return;
    registerGuestSession(sessionId, guestContext.roomNumber, guestContext.guestName, guestContext.hotel).catch(() => {});
  }, [sessionId, guestContext?.roomNumber, guestContext?.guestName, guestContext?.hotel]);

  // The transcript itself only ever lived in this component's local state — a page reload, a
  // dev-server hot-reload, or just this component remounting lost it completely even though the
  // conversation and its responses were already correct and durably logged server-side the whole
  // time. Reading that log back in on mount means the on-screen chat survives all of that instead
  // of silently going blank after "some time," with no change to how the conversation itself works.
  useEffect(() => {
    getSessionMessages(sessionId)
      .then(({ messages: saved }) => {
        if (saved?.length) {
          setMessages(saved.map((m) => ({ id: m.id, role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
    // Intentionally once per mount — this is a one-time rehydration, not something that should
    // re-run and clobber newer in-progress messages if sessionId were to change later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanDetected = useCallback((text) => {
    const parsed = parseRoomQrText(text);
    if (!parsed) {
      setIsScanning(false);
      return;
    }
    // A fresh full-page load — same as what happens on a real phone scan — so the cart
    // and session id all reset cleanly for the newly-scanned guest instead of a same-tab
    // state tweak that leaves a stale conversation on screen.
    resetSessionId();
    const params = new URLSearchParams({ room: parsed.room });
    if (parsed.guestName) params.set("guest", parsed.guestName);
    if (parsed.hotel) params.set("hotel", parsed.hotel);
    window.location.href = `${window.location.pathname}?${params.toString()}`;
  }, []);

  const handleUiHints = useCallback(
    (uiHints) => {
      // Mirrors the server's real cart wholesale instead of replaying cartActions as
      // incremental deltas — see useOrder.js's setCartSnapshot for why (confirmed a real
      // desync: two items added in one turn left this panel showing only the second one).
      if (uiHints.cart) {
        order.setCartSnapshot(uiHints.cart);
      }
      if (uiHints.itemsTable) {
        updateLastMessage({ itemsTable: uiHints.itemsTable });
      }
      if (uiHints.orderId) {
        // No longer navigates to a separate confirmation page — that unmounted this whole
        // page, including the live voice call, the instant an order was placed. The guest
        // can now be asked "anything else?" and keep ordering in the same call; an inline
        // banner (below) confirms the order instead, and the confirmation page is still
        // reachable from it for guests who want the detailed view.
        order.markConfirmed(uiHints.orderId, uiHints.orderTotal);
      }
    },
    [order, updateLastMessage]
  );

  const liveVoice = useRealtimeVoice({
    onTranscript: addMessage,
    onUiHints: handleUiHints,
    guestContext,
  });

  // These three go through the real cart API and mirror back whatever the server actually
  // has, same principle as handleUiHints above, instead of only touching local display state.
  const handleAddItem = useCallback(
    async (action) => {
      try {
        const result = await addToCart(sessionId, action.name, action.quantity || 1);
        if (result.cart) order.setCartSnapshot({ items: result.cart, total: result.total });
      } catch (err) {
        console.error("Failed to add item:", err);
      }
    },
    [sessionId, order]
  );

  const handleUpdateQuantity = useCallback(
    async (name, quantity) => {
      try {
        const result = await setCartItemQuantity(sessionId, name, quantity);
        if (result.cart) order.setCartSnapshot({ items: result.cart, total: result.total });
      } catch (err) {
        console.error("Failed to update quantity:", err);
      }
    },
    [sessionId, order]
  );

  const handleRemoveItem = useCallback(
    async (name) => {
      try {
        const result = await removeFromCart(sessionId, name);
        if (result.cart) order.setCartSnapshot({ items: result.cart, total: result.total });
      } catch (err) {
        console.error("Failed to remove item:", err);
      }
    },
    [sessionId, order]
  );

  const handleConfirmOrder = useCallback(async () => {
    // Confirms whatever the SERVER's cart actually has — never re-described from this page's
    // own local `order.items` as free text. That used to go through the chatbot as a plain
    // sentence ("Please confirm my order: 1x Dal Makhani, ..."), which was a real duplicate-order
    // bug: if a voice call had already confirmed the order and a UI sync gap left this panel
    // still showing the (already-ordered) items, clicking this re-described them to the LLM as a
    // brand new request and it placed a genuine second order. Confirming directly against the
    // server's cart means this button can only ever confirm what's really still pending — if
    // that's already empty, confirm_order's own guard rejects it instead of duplicating anything.
    setIsConfirming(true);
    try {
      const result = await confirmOrderRequest(sessionId, guestContext.guestName, guestContext.roomNumber);
      if (result.success) {
        order.markConfirmed(result.orderId, result.total);
      } else {
        console.error("Failed to confirm order:", result.message);
      }
    } catch (err) {
      console.error("Failed to confirm order:", err);
    } finally {
      setIsConfirming(false);
    }
  }, [sessionId, guestContext.guestName, guestContext.roomNumber, order]);

  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-brand-50">
      <Header
        onToggleOrder={() => setIsOrderPanelOpen(true)}
        orderCount={order.items.length}
        onScan={() => setIsScanning(true)}
        hotelName={hotelName}
      />

      {order.orderConfirmed && order.confirmedOrderId !== dismissedOrderId && (
        <div className="mx-auto flex w-full max-w-6xl animate-fade-in items-center justify-between gap-3 border-b border-green-100 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs text-white">
              ✓
            </span>
            {order.confirmedOrderCount > 1
              ? `Order placed! That's ${order.confirmedOrderCount} orders, ₹${order.confirmedTotal.toFixed(0)} total this visit.`
              : "Order placed! We'll have it ready shortly."}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs">
            <Link
              to={`/confirmation/${order.confirmedOrderId}`}
              className="font-medium text-green-700 underline hover:text-green-900"
            >
              View details
            </Link>
            <button
              type="button"
              onClick={() => setDismissedOrderId(order.confirmedOrderId)}
              className="text-green-700/60 hover:text-green-900"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      <div className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 lg:border-x lg:border-brand-100">
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {messages.length === 0 ? (
            <VoiceStage
              status={liveVoice.status}
              error={liveVoice.error}
              onStart={liveVoice.start}
              onStop={liveVoice.stop}
              guestName={guestContext.guestName}
              roomNumber={guestContext.roomNumber}
              onScan={() => setIsScanning(true)}
              showScan
              hotelName={hotelName}
            />
          ) : (
            <>
              <LiveTranscript messages={messages} onAddItem={handleAddItem} />
              <VoiceControlBar
                status={liveVoice.status}
                error={liveVoice.error}
                onStart={liveVoice.start}
                onStop={liveVoice.stop}
              />
            </>
          )}
        </main>

        <OrderPanel
          items={order.items}
          total={order.total}
          confirmedTotal={order.confirmedTotal}
          confirmedOrderCount={order.confirmedOrderCount}
          onUpdateQuantity={handleUpdateQuantity}
          onRemove={handleRemoveItem}
          onConfirm={handleConfirmOrder}
          isOpen={isOrderPanelOpen}
          onClose={() => setIsOrderPanelOpen(false)}
          disabled={isConfirming}
        />
      </div>

      {isScanning && <QrScannerModal onDetect={handleScanDetected} onClose={() => setIsScanning(false)} />}
    </div>
  );
}
