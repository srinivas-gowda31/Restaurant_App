import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionId } from "./useSessionId.js";
import { REALTIME_SAMPLE_RATE, arrayBufferToBase64, RealtimePlaybackQueue } from "../utils/realtimeAudio.js";

// Browsers default speechSynthesis to whatever system voice is first in the list, which is
// often a low-quality/robotic one. Preferring a named higher-quality voice (Chrome/Edge ship
// "Google"-branded ones, Safari/Windows ship "Natural"/"Enhanced"/"Premium" ones) reads far
// clearer. Falls back to any English voice, then whatever's available, rather than failing.
function pickFillerVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const byQualityMarker = voices.find(
    (v) => /^en/i.test(v.lang) && /(Google|Natural|Enhanced|Premium|Neural)/i.test(v.name)
  );
  if (byQualityMarker) return byQualityMarker;

  const enUS = voices.find((v) => v.lang === "en-US");
  if (enUS) return enUS;

  const anyEnglish = voices.find((v) => /^en/i.test(v.lang));
  return anyEnglish || voices[0];
}

// Releases exactly the resources THIS call session owns. Deliberately takes the session
// object directly rather than reading shared refs — see the big comment above generationRef
// below for why that distinction is the whole fix.
function teardownSession(session) {
  if (!session) return;
  try {
    session.workletNode?.port.close();
    session.workletNode?.disconnect();
  } catch {
    // already disconnected/closed — fine
  }
  try {
    session.sourceNode?.disconnect();
  } catch {
    // ignore
  }
  try {
    session.playbackNode?.port.close();
    session.playbackNode?.disconnect();
  } catch {
    // ignore
  }
  try {
    // onend would otherwise try to auto-restart it — clear the handler before stopping.
    if (session.recognition) session.recognition.onend = null;
    session.recognition?.stop();
  } catch {
    // ignore
  }
  try {
    session.stream?.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
  try {
    session.audioContext?.close().catch(() => {});
  } catch {
    // ignore
  }
}

// Azure's realtime whisper-1 side-channel transcription (used purely for the on-screen guest
// caption — the model itself always hears raw audio directly and answers correctly regardless)
// turned out to be seriously unreliable in testing: confirmed live, a plain, clearly-spoken
// "Good morning" came back as an outright transcription failure, and other turns came back
// transcribed into the wrong script entirely. Where the browser supports its own speech
// recognition (Chrome/Edge), that's a strictly better source for this one purpose — it runs
// locally against the same mic stream, doesn't depend on Azure's preview transcription pipeline
// at all, and reuses the mic permission already granted for the call. Falls back to Azure's own
// transcript messages (realtime.js) only where SpeechRecognition isn't available at all.
const SpeechRecognitionClass =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function useRealtimeVoice({ onTranscript, onUiHints, guestContext } = {}) {
  const [sessionId] = useState(getSessionId);
  const [status, setStatus] = useState("idle"); // idle | connecting | connected | speaking | error
  const [error, setError] = useState(null);

  // Every mic/audio/WebSocket resource used to live in shared refs, reused across calls. If
  // a guest ended a call and started a new one quickly, the OLD WebSocket's onmessage/onclose
  // handlers stayed attached and could still fire — a message already in flight from the
  // server, or the close handshake finishing late — but by then those handlers read the
  // SAME shared refs, which the new call had already overwritten. That sent stale audio into
  // the new call's playback queue (heard as overlapping/repeated audio), appended a stale
  // transcript line into the new call's conversation, and in the worst case had the old
  // socket's onclose call cleanup() on the NEW call's live audio context, killing it moments
  // after it started. That's what was reported as "overlapping" and "a sentence repeated."
  //
  // The fix: every start() gets its own generation number and its own private `session`
  // object holding only ITS OWN resources. Every handler checks `generationRef.current ===
  // myGeneration` before touching React state or shared queues, so a superseded call's
  // trailing events become no-ops instead of corrupting whatever call replaced it.
  const generationRef = useRef(0);
  const activeSessionRef = useRef(null);

  const fillerActiveRef = useRef(false);
  const fillerTimeoutRef = useRef(null);

  // Chrome/Edge populate the voice list asynchronously — calling getVoices() once up front
  // and listening for "voiceschanged" means pickFillerVoice() has real options by the time
  // the guest actually taps the mic, instead of only ever seeing the (often robotic) default.
  useEffect(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    const handleVoicesChanged = () => {};
    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
  }, []);

  // The backend round trip to Azure (DB lookup, WebSocket handshake, session config,
  // model time-to-first-audio) can easily run a couple of seconds — long enough that a
  // guest who starts talking the instant they see "Listening" gets no feedback at all and
  // assumes nothing happened. This local, zero-network filler plays the moment the mic
  // button is tapped, independent of any of that, so there's never real dead air. It's cut
  // off the instant the real greeting's audio actually starts (see "audio_delta" below).
  //
  // It's spoken by the OS/browser's TTS engine, not through the AudioContext graph the real
  // bot's audio plays through — getUserMedia's echoCancellation is tuned for that graph, not
  // for speechSynthesis output, so it doesn't reliably cancel this out. Confirmed live: the
  // mic picked up the device's own speaker saying this line, sent it on as "guest speech",
  // and the assistant replied to it. fillerActiveRef mutes outgoing mic audio for as long as
  // the filler is actually talking so that can't happen, regardless of echo cancellation.
  const speakInstantFiller = useCallback(() => {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("One moment, connecting you to your concierge.");
      const voice = pickFillerVoice();
      if (voice) utterance.voice = voice;
      // Clear, natural pace rather than rushed — a guest needs to actually understand this,
      // not just hear that something is happening. Volume 1 is the API's max (no "louder"
      // beyond that is possible from here — true loudness is the device's own volume level).
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;
      fillerActiveRef.current = true;
      const clear = () => {
        if (fillerTimeoutRef.current) clearTimeout(fillerTimeoutRef.current);
        fillerTimeoutRef.current = null;
        // Same trailing-echo race as stopInstantFiller below — onend/onerror firing doesn't
        // guarantee the physical speaker has actually gone silent yet.
        setTimeout(() => {
          fillerActiveRef.current = false;
        }, 300);
      };
      utterance.onend = clear;
      utterance.onerror = clear;
      // Safety net — onend doesn't fire reliably on every browser/OS combination, and a
      // stuck fillerActiveRef would mute the guest's real mic for the rest of the call.
      fillerTimeoutRef.current = setTimeout(clear, 4000);
      window.speechSynthesis.speak(utterance);
    } catch {
      // Browser TTS unsupported/unavailable — the real greeting still arrives shortly after;
      // this was only ever a bridge to cover the wait for it, not load-bearing.
      fillerActiveRef.current = false;
    }
  }, []);

  const stopInstantFiller = useCallback(() => {
    if (fillerTimeoutRef.current) {
      clearTimeout(fillerTimeoutRef.current);
      fillerTimeoutRef.current = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    // speechSynthesis.cancel() doesn't guarantee the physical speaker stops instantly —
    // confirmed live, especially right after a mic close/reopen: the mic and the local
    // recognizer picked up a brief trailing echo of the filler's own voice in the moment right
    // after this flag used to flip synchronously, and sent it on as if the guest had said it
    // ("one moment connecting YouTube" showing up as a fake guest message). A short grace delay
    // after cancel() gives that trailing echo time to actually finish before mic/recognition
    // un-mute again.
    setTimeout(() => {
      fillerActiveRef.current = false;
    }, 300);
  }, []);

  const stop = useCallback(() => {
    // Bump the generation FIRST — any of this call's handlers that fire after this point
    // (including its own ws.onclose, about to be triggered below) will see they've been
    // superseded and skip touching status/error/shared state.
    generationRef.current += 1;
    const session = activeSessionRef.current;
    activeSessionRef.current = null;
    session?.ws?.close();
    stopInstantFiller();
    teardownSession(session);
    setStatus("idle");
  }, [stopInstantFiller]);

  const start = useCallback(async () => {
    const myGeneration = ++generationRef.current;
    const isCurrent = () => generationRef.current === myGeneration;

    // Defensive: release whatever the previous call left active. Normally stop() already
    // did this, but start() can also be called directly (e.g. after an error) without it.
    teardownSession(activeSessionRef.current);
    activeSessionRef.current = null;

    setError(null);
    setStatus("connecting");
    // Fired synchronously off the tap that called start(), before any await — some browsers
    // only allow speech synthesis when it's triggered directly by a user gesture like this.
    speakInstantFiller();

    // This call's own resources and in-flight state — never read through a shared ref, so a
    // superseded call's stale handlers can't act on a newer call's audio/queue/socket.
    const session = {
      stream: null,
      audioContext: null,
      workletNode: null,
      sourceNode: null,
      playbackNode: null,
      recognition: null,
    };
    let playbackQueue = null;
    let pendingUiHints = null;

    try {
      // autoGainControl has a brief calibration ramp-up on many browsers — the first moment
      // of speech can come out attenuated/distorted while it settles, which reads as "the
      // mic doesn't detect me right away," so that stays off. noiseSuppression used to be
      // off for the same reason, but confirmed live: ambient room/restaurant noise (chatter,
      // AC hum, clinking) was getting picked up and treated as speech — worth the brief
      // ramp-up to actually filter that out, paired with the higher VAD threshold server-side
      // (see realtime.js) so background noise doesn't get mistaken for the start of a turn.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, autoGainControl: false, noiseSuppression: true },
      });
      if (!isCurrent()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      session.stream = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: REALTIME_SAMPLE_RATE });
      session.audioContext = audioContext;
      // Runs PCM capture/playback on the dedicated audio thread instead of the main thread
      // (what ScriptProcessorNode, and chained AudioBufferSourceNodes, did) — main-thread
      // contention and per-chunk node boundaries were the likely causes of choppy audio.
      await Promise.all([
        audioContext.audioWorklet.addModule("/pcm-worklet.js"),
        audioContext.audioWorklet.addModule("/pcm-playback-worklet.js"),
      ]);
      if (!isCurrent()) {
        teardownSession(session);
        return;
      }

      const playbackNode = new AudioWorkletNode(audioContext, "pcm-playback-processor", {
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      playbackNode.connect(audioContext.destination);
      session.playbackNode = playbackNode;
      playbackQueue = new RealtimePlaybackQueue(playbackNode);

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const params = new URLSearchParams({ sessionId });
      if (guestContext?.roomNumber) params.set("room", guestContext.roomNumber);
      if (guestContext?.guestName) params.set("guest", guestContext.guestName);
      if (guestContext?.hotel) params.set("hotel", guestContext.hotel);
      const ws = new WebSocket(`${proto}//${window.location.host}/api/realtime?${params.toString()}`);
      session.ws = ws;
      activeSessionRef.current = session;

      ws.onopen = () => {
        if (!isCurrent()) return;
        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "pcm-capture-processor");
        session.sourceNode = source;
        session.workletNode = workletNode;

        workletNode.port.onmessage = (e) => {
          if (!isCurrent() || ws.readyState !== WebSocket.OPEN) return;
          // Don't forward mic frames while the local filler is still talking — see the
          // comment on speakInstantFiller for why: without this, the mic can pick up the
          // filler's own speaker output and send it on as if the guest had said it.
          if (fillerActiveRef.current) return;
          ws.send(JSON.stringify({ type: "input_audio", audio: arrayBufferToBase64(e.data) }));
        };

        source.connect(workletNode);

        if (SpeechRecognitionClass) {
          const recognition = new SpeechRecognitionClass();
          recognition.continuous = true;
          recognition.interimResults = false;
          // Hindi isn't wired up here yet — the call's language lock is decided server-side
          // and isn't currently surfaced back to the client to switch this dynamically. English
          // is the safe default since that's the large majority of calls; a guest speaking
          // Hindi still gets a fully correct call (the model hears real audio either way), just
          // without an accurate on-screen caption for those turns.
          recognition.lang = "en-US";
          recognition.onresult = (e) => {
            if (!isCurrent()) return;
            // Same guard as the mic-forwarding path above, same reason: confirmed live, the
            // instant local filler ("One moment, connecting you...") got picked back up by
            // this recognizer through the device speaker and shown on screen as if the guest
            // had said it. speechSynthesis output isn't run through the AudioContext graph
            // getUserMedia's echoCancellation is tuned for, so it isn't reliably cancelled out.
            if (fillerActiveRef.current) return;
            const result = e.results[e.results.length - 1];
            if (result.isFinal) {
              const text = result[0].transcript?.trim();
              if (text) onTranscript?.("user", text);
            }
          };
          // "no-speech"/"aborted"/network blips are routine during a long call, not fatal —
          // onend below restarts it. Swallow here so they don't surface as call errors.
          recognition.onerror = () => {};
          recognition.onend = () => {
            if (isCurrent() && activeSessionRef.current === session) {
              try {
                recognition.start();
              } catch {
                // already running — benign race between onend and a manual restart
              }
            }
          };
          try {
            recognition.start();
            session.recognition = recognition;
          } catch {
            // Non-fatal — falls through to Azure's own transcript messages below.
          }
        }

        // The mic is fully live at this point — don't make the guest stare at "Connecting…"
        // for the few extra seconds the backend needs to separately open and confirm its own
        // connection to Azure. Anything the guest says before that finishes is buffered
        // server-side and forwarded once it does (see realtime.js), and the instant local
        // filler above covers the wait so it doesn't feel like dead air either way.
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        if (!isCurrent()) return;

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
            // Local SpeechRecognition (started in ws.onopen above) is the caption source for
            // the guest's own turns when the browser supports it — Azure's own user-role
            // transcript would just duplicate or conflict with it. Only fall back to Azure's
            // version (including its "(audio not transcribed)" placeholder) when the browser
            // has no SpeechRecognition support at all.
            if (msg.role === "user" && SpeechRecognitionClass) break;
            onTranscript?.(msg.role, msg.text);
            if (msg.role === "assistant" && pendingUiHints) {
              onUiHints?.(pendingUiHints);
              pendingUiHints = null;
            }
            break;
          case "audio_delta":
            // The real greeting's audio has actually started — cut the local filler off right
            // away so the two never talk over each other.
            stopInstantFiller();
            playbackQueue?.enqueue(msg.audio);
            setStatus("speaking");
            break;
          case "ui_hints":
            pendingUiHints = msg.uiHints;
            break;
          case "error":
            stopInstantFiller();
            setError(msg.message);
            setStatus("error");
            break;
          default:
            break;
        }
      };

      ws.onerror = () => {
        if (!isCurrent()) return;
        stopInstantFiller();
        setError("Voice connection error.");
        setStatus("error");
      };

      ws.onclose = () => {
        // Always release THIS call's own resources — it still holds a real mic stream/
        // AudioContext that needs closing even if a newer call has since superseded it.
        teardownSession(session);
        if (activeSessionRef.current === session) activeSessionRef.current = null;
        if (!isCurrent()) return;
        stopInstantFiller();
        setStatus((prev) => (prev === "error" ? "error" : "idle"));
      };
    } catch (err) {
      teardownSession(session);
      if (activeSessionRef.current === session) activeSessionRef.current = null;
      if (!isCurrent()) return;
      stopInstantFiller();
      setError("Microphone access was denied or is unavailable.");
      setStatus("error");
    }
  }, [sessionId, onTranscript, onUiHints, guestContext, speakInstantFiller, stopInstantFiller]);

  return { status, error, start, stop, isActive: status !== "idle" && status !== "error" };
}
