import { Fragment, useEffect, useState } from "react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchAdminOrders } from "../services/api.js";

export default function OrdersTable() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchAdminOrders()
      .then((data) => setOrders(data.orders))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!orders) return <LoadingSpinner size="lg" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
            <th className="px-4 py-3">Order ID</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Items</th>
            <th className="px-4 py-3">Total</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <Fragment key={order.id}>
              <tr
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                className="cursor-pointer border-b border-brand-50 last:border-0 hover:bg-brand-50/60"
              >
                <td className="px-4 py-2 font-mono text-xs">{order.id.slice(-8).toUpperCase()}</td>
                <td className="px-4 py-2">{new Date(order.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2">{order.items.length} item(s)</td>
                <td className="px-4 py-2">₹{order.total.toFixed(0)}</td>
                <td className="px-4 py-2 capitalize">{order.status}</td>
              </tr>
              {expandedId === order.id && (
                <tr className="border-b border-brand-50 bg-brand-50/40">
                  <td colSpan={5} className="px-4 py-3">
                    <ul className="space-y-1 text-xs text-navy-950/80">
                      {order.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}× {item.name} — ₹{(item.unitPrice * item.quantity).toFixed(0)}
                        </li>
                      ))}
                    </ul>
                    {(order.guestName || order.roomNumber) && (
                      <p className="mt-2 text-xs text-navy-950/60">
                        {order.guestName && `Guest: ${order.guestName} `}
                        {order.roomNumber && `Room: ${order.roomNumber}`}
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No orders yet.</p>}
    </div>
  );
}
