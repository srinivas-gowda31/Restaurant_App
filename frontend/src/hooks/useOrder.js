import { useCallback, useMemo, useState } from "react";

export function useOrder() {
  const [items, setItems] = useState([]);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [confirmedOrderId, setConfirmedOrderId] = useState(null);

  const applyCartAction = useCallback((action) => {
    if (!action) return;

    setItems((prev) => {
      if (action.type === "add") {
        const existing = prev.find((i) => i.name === action.name);
        const qty = action.quantity || 1;
        if (existing) {
          return prev.map((i) =>
            i.name === action.name ? { ...i, quantity: i.quantity + qty } : i
          );
        }
        return [...prev, { name: action.name, quantity: qty, unitPrice: action.unitPrice }];
      }

      if (action.type === "remove") {
        return prev.filter((i) => i.name !== action.name);
      }

      if (action.type === "clear") {
        return [];
      }

      return prev;
    });
  }, []);

  const updateQuantity = useCallback((name, quantity) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.name !== name)
        : prev.map((i) => (i.name === name ? { ...i, quantity } : i))
    );
  }, []);

  const removeItem = useCallback((name) => {
    setItems((prev) => prev.filter((i) => i.name !== name));
  }, []);

  const clearOrder = useCallback(() => {
    setItems([]);
  }, []);

  const markConfirmed = useCallback((orderId) => {
    setOrderConfirmed(true);
    setConfirmedOrderId(orderId);
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
    applyCartAction,
    updateQuantity,
    removeItem,
    clearOrder,
    markConfirmed,
  };
}
