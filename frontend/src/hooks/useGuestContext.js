import { useEffect, useState } from "react";
import { fetchRoomByNumber } from "../services/api.js";
import { resetSessionId } from "./useSessionId.js";

// Pulls hotel/room/guest out of a scanned QR code's payload. Deliberately never navigates to
// the scanned URL itself (it could point anywhere) — only these query params are ever read out
// of it. hotel (a slug) is what makes multi-hotel work at all: it's what tells the backend which
// hotel's catalog/rooms/orders this guest's session should ever touch.
export function parseRoomQrText(text) {
  try {
    const url = new URL(text);
    const room = url.searchParams.get("room");
    if (!room) return null;
    return { room, guestName: url.searchParams.get("guest"), hotel: url.searchParams.get("hotel") };
  } catch {
    return null;
  }
}

function readFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const roomNumber = params.get("room");
  const hotel = params.get("hotel");
  return roomNumber
    ? { roomNumber, guestName: params.get("guest"), hotel }
    : { roomNumber: null, guestName: null, hotel };
}

// The guest's identity comes ONLY from the current URL's ?hotel=&room=&guest= — set once by
// scanning a room QR code, which reloads the page to that URL. No localStorage fallback:
// landing on a bare URL (a fresh tab, or the site typed in directly) always shows the
// generic welcome, never a guest remembered from some earlier scan on this device. hotel with
// no room (a hotel's own bare landing link, no specific room) is still a valid, meaningful
// visit — only roomNumber absence resets the session, same as before multi-hotel support.
//
// A bare visit also mints a brand-new session id, so the backend never keeps attributing
// chat/orders to whichever guest last scanned on this browser either.
export function useGuestContext() {
  const [guest, setGuest] = useState(() => {
    const initial = readFromUrl();
    // Runs before any other hook reads the session id this render, so a bare visit's
    // chat/voice session is guaranteed fresh rather than inheriting a prior scan's.
    if (!initial.roomNumber) resetSessionId();
    return initial;
  });

  useEffect(() => {
    if (!guest.roomNumber) return;
    // The QR only carries a snapshot of the guest name — confirm it's still current in
    // case the room's been reassigned since the code was printed.
    fetchRoomByNumber(guest.roomNumber, guest.hotel)
      .then((data) => {
        if (data.room?.guestName) {
          setGuest((prev) => ({ ...prev, guestName: data.room.guestName }));
        }
      })
      .catch(() => {
        // Stale/unknown room — keep whatever the QR itself said.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return guest;
}
