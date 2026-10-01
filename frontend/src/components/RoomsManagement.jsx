import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import LoadingSpinner from "./LoadingSpinner.jsx";
import { fetchAdminRooms, createRoom, updateRoom, deleteRoom, fetchAdminHotel } from "../services/api.js";

// Encodes the hotel's own slug alongside the room number and guest name — without it, a
// multi-hotel deployment couldn't tell WHICH hotel's room/catalog a scan should even resolve
// against (room numbers are only unique within a hotel, not globally). Scanning the code still
// greets the guest by name immediately either way, with no extra round-trip before first paint.
function roomQrUrl(number, guestName, hotelSlug) {
  const params = new URLSearchParams({ room: number });
  if (guestName) params.set("guest", guestName);
  if (hotelSlug) params.set("hotel", hotelSlug);
  return `${window.location.origin}/?${params.toString()}`;
}

function RoomQrCode({ number, guestName, hotelSlug }) {
  const canvasRef = useRef(null);

  const download = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `room-${number}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex items-center gap-2">
      <div ref={canvasRef}>
        <QRCodeCanvas value={roomQrUrl(number, guestName, hotelSlug)} size={64} />
      </div>
      <button type="button" onClick={download} className="text-xs text-brand-600 hover:underline">
        Download
      </button>
    </div>
  );
}

const EMPTY_DRAFT = { number: "", guestName: "" };

export default function RoomsManagement() {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [newRoom, setNewRoom] = useState(EMPTY_DRAFT);
  const [addError, setAddError] = useState(null);
  const [hotelSlug, setHotelSlug] = useState(null);

  const load = () => {
    fetchAdminRooms()
      .then((data) => setRooms(data.rooms))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);
  useEffect(() => {
    fetchAdminHotel()
      .then((data) => setHotelSlug(data.hotel?.slug || null))
      .catch(() => {
        // Non-fatal — QR codes just fall back to no ?hotel= param (the default hotel).
      });
  }, []);

  const startEdit = (room) => {
    setEditingId(room.id);
    setDraft({ ...room });
  };

  const saveEdit = async () => {
    await updateRoom(editingId, { number: draft.number, guestName: draft.guestName });
    setEditingId(null);
    load();
  };

  const removeRoom = async (id) => {
    await deleteRoom(id);
    load();
  };

  const submitNewRoom = async (e) => {
    e.preventDefault();
    if (!newRoom.number.trim()) {
      setAddError("Room number is required.");
      return;
    }
    setAddError(null);
    try {
      await createRoom({ number: newRoom.number.trim(), guestName: newRoom.guestName.trim() });
      setNewRoom(EMPTY_DRAFT);
      setIsAdding(false);
      load();
    } catch (err) {
      setAddError(err.message);
    }
  };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rooms) return <LoadingSpinner size="lg" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-navy-950/60">
          Each room's QR code links straight to the concierge with that guest's name and room number, so scanning it
          greets them by name and asks how it can help — no typing required.
        </p>
        <button
          type="button"
          onClick={() => {
            setIsAdding((v) => !v);
            setNewRoom(EMPTY_DRAFT);
          }}
          className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
        >
          {isAdding ? "Cancel" : "+ Add Room"}
        </button>
      </div>

      {isAdding && (
        <form
          onSubmit={submitNewRoom}
          className="flex flex-col gap-3 rounded-xl border border-brand-100 bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div className="min-w-[120px]">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Room Number</label>
            <input
              value={newRoom.number}
              onChange={(e) => setNewRoom((d) => ({ ...d, number: e.target.value }))}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              placeholder="e.g. 106"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-navy-950/70">Guest Name</label>
            <input
              value={newRoom.guestName}
              onChange={(e) => setNewRoom((d) => ({ ...d, guestName: e.target.value }))}
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-navy-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-800"
          >
            Save
          </button>
          {addError && <p className="w-full text-xs text-red-600">{addError}</p>}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead>
            <tr className="border-b border-brand-100 text-xs uppercase text-navy-950/50">
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">QR Code</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => {
              const isEditing = editingId === room.id;
              return (
                <tr key={room.id} className="border-b border-brand-50 last:border-0">
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        value={draft.number}
                        onChange={(e) => setDraft((d) => ({ ...d, number: e.target.value }))}
                        className="w-24 rounded border border-brand-200 px-2 py-1"
                      />
                    ) : (
                      room.number
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        value={draft.guestName || ""}
                        onChange={(e) => setDraft((d) => ({ ...d, guestName: e.target.value }))}
                        className="w-full rounded border border-brand-200 px-2 py-1"
                      />
                    ) : (
                      room.guestName || <span className="text-navy-950/40">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <RoomQrCode number={room.number} guestName={room.guestName} hotelSlug={hotelSlug} />
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={saveEdit} className="text-brand-600 hover:underline">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-navy-950/50 hover:underline">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(room)} className="text-brand-600 hover:underline">
                          Edit
                        </button>
                        <button type="button" onClick={() => removeRoom(room.id)} className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rooms.length === 0 && <p className="px-4 py-6 text-center text-sm text-navy-950/50">No rooms yet.</p>}
      </div>
    </div>
  );
}
