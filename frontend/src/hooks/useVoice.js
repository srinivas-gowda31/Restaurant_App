import { useCallback, useEffect, useRef, useState } from "react";
import { sendVoiceMessage } from "../services/api.js";
import { getSessionId } from "./useSessionId.js";
import { blobToWavBlob } from "../utils/audioEncode.js";

const MAX_RECORDING_MS = 60000;

export function useVoice({ onTurnComplete } = {}) {
  const [sessionId] = useState(getSessionId);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timeoutRef = useRef(null);
  const audioElRef = useRef(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanupStream, [cleanupStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanupStream();
        setIsRecording(false);
        const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (rawBlob.size === 0) return;

        setIsProcessing(true);
        try {
          const wavBlob = await blobToWavBlob(rawBlob);
          const { transcript, reply, uiHints, audioBase64 } = await sendVoiceMessage(sessionId, wavBlob);
          onTurnComplete?.({ transcript, reply, uiHints });
          if (audioBase64) {
            const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
            audioElRef.current = audio;
            audio.play().catch(() => {});
          }
        } catch (err) {
          setError(err.message);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
      timeoutRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (err) {
      setError("Microphone access was denied or is unavailable.");
    }
  }, [sessionId, cleanupStream, onTurnComplete, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording, isProcessing, error, toggleRecording };
}
