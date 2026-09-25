import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import { prisma, DEFAULT_HOTEL_ID } from "../src/db.js";

// Defaults to the local Vite dev server. Pass a real URL when the app is reachable over
// LAN/production, e.g.: node scripts/generateRoomQrCodes.js https://yourhotel.com
const BASE_URL = process.argv[2] || process.env.GUEST_APP_URL || "http://localhost:5173";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "qr-codes");

async function main() {
  const rooms = await prisma.room.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID },
    orderBy: { number: "asc" },
  });

  if (rooms.length === 0) {
    console.log("No rooms found — run `npm run prisma:seed` first.");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const room of rooms) {
    const params = new URLSearchParams({ room: room.number });
    if (room.guestName) params.set("guest", room.guestName);
    const url = `${BASE_URL}/?${params.toString()}`;

    const filePath = path.join(OUT_DIR, `room-${room.number}-qr.png`);
    await QRCode.toFile(filePath, url, { width: 512, margin: 2 });
    console.log(`Room ${room.number} (${room.guestName || "unassigned"}) -> ${filePath}`);
  }

  console.log(`\nDone. ${rooms.length} QR codes written to ${OUT_DIR}`);
  console.log(`Encoded base URL: ${BASE_URL}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
