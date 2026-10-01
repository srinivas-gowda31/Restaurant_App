import { useCallback, useMemo, useState } from "react";

export function useOrder() {
  const [items, setItems] = useState([]);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);
  const [confirmedOrderCount, setConfirmedOrderCount] = useState(0);
  // Sum of every order actually PLACED this visit (separate from `total`, which is only the
  // current in-progress cart) — a guest can place more than one order in the same call, and
  // without this the panel only ever showed whatever the most recent order happened to be,
  // with no way to see everything they've actually been charged for so far.
  const [confirmedTotal, setConfirmedTotal] = useState(0);

  // Replaces the whole local cart with the server's real one, rather than replaying deltas —
  // see GuestPage.jsx's handleUiHints for why (a real desync bug where two items added in one
  // turn only showed one in this panel, even though the deltas themselves looked correct).
  const setCartSnapshot = useCallback((cart) => {
    const nextItems = cart?.items?.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })) || [];
    setItems(nextItems);
    // A guest can place more than one order in the same call now (confirm, then "yes, add
    // more"), so the "order confirmed" banner needs to clear itself the moment a fresh item
    // lands, rather than sticking around from the previous order.
    if (nextItems.length > 0) setOrderConfirmed(false);
  }, []);

  const clearOrder = useCallback(() => {
    setItems([]);
  }, []);

  const markConfirmed = useCallback((orderId, orderTotal) => {
    setOrderConfirmed(true);
    setConfirmedOrderId(orderId);
    setConfirmedOrderCount((n) => n + 1);
    if (typeof orderTotal === "number") setConfirmedTotal((sum) => sum + orderTotal);
    setItems([]);
  }, []);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [items]
  );

  return {
    items,
    total,
    orderConfirmed,
    confirmedOrderId,
    confirmedOrderCount,
    confirmedTotal,
    setCartSnapshot,
    clearOrder,
    markConfirmed,
  };
}
