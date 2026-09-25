export const REALTIME_SAMPLE_RATE = 24000;

export function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function int16ToFloat32(int16Array) {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32Array;
}

/**
 * Feeds base64-encoded PCM16 deltas to a pcm-playback-processor AudioWorkletNode (see
 * public/pcm-playback-worklet.js) for gapless playback. Delegates to the worklet rather
 * than scheduling a chain of AudioBufferSourceNodes — chaining many small nodes back to
 * back, even with perfect timing, can still click at each node boundary since the
 * waveform itself has a discontinuity where one buffer ends and the next begins. A single
 * continuous worklet stream has no such boundaries.
 */
export class RealtimePlaybackQueue {
  constructor(playbackNode) {
    this.playbackNode = playbackNode;
  }

  enqueue(base64Pcm16) {
    const pcmBuffer = base64ToArrayBuffer(base64Pcm16);
    const int16 = new Int16Array(pcmBuffer);
    const float32 = int16ToFloat32(int16);
    this.playbackNode.port.postMessage(float32.buffer, [float32.buffer]);
  }

  clear() {
    this.playbackNode.port.postMessage("clear");
  }
}
