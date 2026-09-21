import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header.jsx";
import LoadingSpinner from "../components/LoadingSpinner.jsx";
import { fetchOrder } from "../services/api.js";

export default function ConfirmationPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOrder(orderId)
      .then(({ order }) => setOrder(order))
      .catch((err) => setError(err.message));
  }, [orderId]);

  return (
    <div className="flex min-h-screen flex-col bg-brand-50">
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 py-10">
        {error && <p className="text-red-600">{error}</p>}

        {!order && !error && <LoadingSpinner size="lg" />}

        {order && (
          <div className="w-full animate-fade-in rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 text-2xl">
                ✓
              </span>
              <h1 className="font-serif text-xl font-bold text-navy-950">Order Confirmed</h1>
              <p className="text-sm text-navy-950/60">Order #{order.id.slice(-8).toUpperCase()}</p>
            </div>

            <div className="space-y-2 border-t border-brand-100 pt-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span>₹{(item.unitPrice * item.quantity).toFixed(0)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between border-t border-brand-100 pt-4 font-semibold text-navy-950">
              <span>Total</span>
              <span>₹{order.total.toFixed(0)}</span>
            </div>

            {(order.guestName || order.roomNumber) && (
              <div className="mt-4 text-sm text-navy-950/70">
                {order.guestName && <p>Guest: {order.guestName}</p>}
                {order.roomNumber && <p>Room: {order.roomNumber}</p>}
              </div>
            )}

            <Link
              to="/"
              className="mt-6 block w-full rounded-full bg-brand-600 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-500"
            >
              Back to Concierge
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
