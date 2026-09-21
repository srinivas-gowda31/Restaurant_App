import { useCallback, useRef, useState } from "react";
import { getSessionId } from "./useSessionId.js";
import { REALTIME_SAMPLE_RATE, floatTo16BitPCM, arrayBufferToBase64, RealtimePlaybackQueue } from "../utils/realtimeAudio.js";

export function useRealtimeVoice({ onTranscript, onUiHints } = {}) {
  const [sessionId] = useState(getSessionId);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | speaking | error
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const playbackRef = useRef(null);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    playbackRef.current?.clear();
    audioContextRef.current?.close().catch(() => {});

    processorRef.current = null;
    sourceNodeRef.current = null;
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: REALTIME_SAMPLE_RATE });
      audioContextRef.current = audioContext;
      playbackRef.current = new RealtimePlaybackQueue(audioContext);

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/realtime?sessionId=${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        sourceNodeRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const pcm = floatTo16BitPCM(input);
          ws.send(JSON.stringify({ type: "input_audio", audio: arrayBufferToBase64(pcm) }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
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
            break;
          case "audio_delta":
            playbackRef.current?.enqueue(msg.audio);
            setStatus("speaking");
            break;
          case "ui_hints":
            onUiHints?.(msg.uiHints);
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
  }, [sessionId, onTranscript, onUiHints, cleanup]);

  return { status, error, start, stop, isActive: status !== "idle" && status !== "error" };
}
