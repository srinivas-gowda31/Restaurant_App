import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Browsers only allow camera access on HTTPS or http://localhost — a plain http://LAN-IP
// origin (e.g. from a phone testing over Wi-Fi) will be blocked by the browser itself.
function isSecureContextForCamera() {
  return window.isSecureContext || window.location.hostname === "localhost";
}

export default function QrScannerModal({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    let cancelled = false;

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          onDetect(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    }

    async function start() {
      if (!isSecureContextForCamera() || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera access needs HTTPS (or localhost). This page is loaded over a plain http:// LAN address, so the browser is blocking it — use localhost, or scan with your phone's regular camera app instead."
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanFrame();
      } catch (err) {
        setError(err.name === "NotAllowedError" ? "Camera access was denied." : "Could not access the camera.");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="w-full" playsInline muted />
      </div>
      <p className="mt-3 max-w-sm text-center text-sm text-white/80">Point your camera at a room QR code.</p>
      {error && <p className="mt-2 max-w-sm text-center text-sm text-red-300">{error}</p>}
      <button
        type="button"
        onClick={onClose}
        className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-medium text-navy-950"
      >
        Cancel
      </button>
    </div>
  );
}
