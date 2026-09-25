import { useCallback, useRef, useState } from "react";
import { getSessionId } from "./useSessionId.js";
import { REALTIME_SAMPLE_RATE, arrayBufferToBase64, RealtimePlaybackQueue } from "../utils/realtimeAudio.js";

export function useRealtimeVoice({ onTranscript, onUiHints, guestContext } = {}) {
  const [sessionId] = useState(getSessionId);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | speaking | error
  const [error, setError] = useState(null);
  const pendingUiHintsRef = useRef(null);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const playbackNodeRef = useRef(null);
  const playbackRef = useRef(null);

  const cleanup = useCallback(() => {
    workletNodeRef.current?.port.close();
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    playbackNodeRef.current?.port.close();
    playbackNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close().catch(() => {});

    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    playbackNodeRef.current = null;
    streamRef.current = null;
    audioContextRef.current = null;
    playbackRef.current = null;
  }, []);

  const stop = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setStatus("connecting");

    try {
      // autoGainControl/noiseSuppression have a brief calibration ramp-up on many
      // browsers — the first moment of speech can come out attenuated/distorted while
      // they settle, which reads as "the mic doesn't detect me right away." Echo
      // cancellation alone (no ramp-up) is enough for a phone-style single-speaker call.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, autoGainControl: false, noiseSuppression: false },
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: REALTIME_SAMPLE_RATE });
      audioContextRef.current = audioContext;
      // Runs PCM capture/playback on the dedicated audio thread instead of the main thread
      // (what ScriptProcessorNode, and chained AudioBufferSourceNodes, did) — main-thread
      // contention and per-chunk node boundaries were the likely causes of choppy audio.
      await Promise.all([
        audioContext.audioWorklet.addModule("/pcm-worklet.js"),
        audioContext.audioWorklet.addModule("/pcm-playback-worklet.js"),
      ]);

      const playbackNode = new AudioWorkletNode(audioContext, "pcm-playback-processor", {
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      playbackNode.connect(audioContext.destination);
      playbackNodeRef.current = playbackNode;
      playbackRef.current = new RealtimePlaybackQueue(playbackNode);

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({ sessionId });
      if (guestContext?.roomNumber) params.set("room", guestContext.roomNumber);
      if (guestContext?.guestName) params.set("guest", guestContext.guestName);
      const ws = new WebSocket(`${proto}//${window.location.host}/api/realtime?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "pcm-capture-processor");
        sourceNodeRef.current = source;
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          ws.send(JSON.stringify({ type: "input_audio", audio: arrayBufferToBase64(e.data) }));
        };

        source.connect(workletNode);

        // The mic is fully live at this point — don't make the guest stare at "Connecting…"
        // for the few extra seconds the backend needs to separately open and confirm its own
        // connection to Azure. Any audio sent before that finishes is harmlessly dropped
        // server-side, and the auto-greeting means the guest isn't expected to speak yet anyway.
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "ready":
            setStatus("connected");
            break;
          case "transcript":
            onTranscript?.(msg.role, msg.text);
            if (msg.role === "assistant" && pendingUiHintsRef.current) {
              onUiHints?.(pendingUiHintsRef.current);
              pendingUiHintsRef.current = null;
            }
            break;
          case "audio_delta":
            playbackRef.current?.enqueue(msg.audio);
            setStatus("speaking");
            break;
          case "ui_hints":
            pendingUiHintsRef.current = msg.uiHints;
            break;
          case "error":
            setError(msg.message);
            setStatus("error");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        setError("Voice connection error.");
        setStatus("error");
      };

      ws.onclose = () => {
        cleanup();
        setStatus((prev) => (prev === "error" ? "error" : "idle"));
      };
    } catch (err) {
      setError("Microphone access was denied or is unavailable.");
      setStatus("error");
      cleanup();
    }
  }, [sessionId, onTranscript, onUiHints, cleanup, guestContext]);

  return { status, error, start, stop, isActive: status !== "idle" && status !== "error" };
}
