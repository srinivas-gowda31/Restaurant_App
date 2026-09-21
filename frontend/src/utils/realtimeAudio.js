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
 * Schedules base64-encoded PCM16 chunks for gapless sequential playback,
 * since Azure Realtime streams audio as a series of small deltas.
 */
export class RealtimePlaybackQueue {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.nextStartTime = 0;
    this.activeSources = new Set();
  }

  enqueue(base64Pcm16) {
    const pcmBuffer = base64ToArrayBuffer(base64Pcm16);
    const int16 = new Int16Array(pcmBuffer);
    const float32 = int16ToFloat32(int16);

    const audioBuffer = this.audioContext.createBuffer(1, float32.length, REALTIME_SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;

    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);
  }

  clear() {
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    this.activeSources.clear();
    this.nextStartTime = 0;
  }

  get isPlaying() {
    return this.activeSources.size > 0;
  }
}
