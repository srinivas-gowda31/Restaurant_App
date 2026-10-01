// A single continuous audio stream instead of many separate AudioBufferSourceNodes (one
// per delta chunk) chained back-to-back. Chaining nodes — even with perfect timing and zero
// gaps between them — can still produce an audible click/crackle at each chunk boundary,
// because the waveform itself has a tiny discontinuity where one buffer's samples end and
// the next's begin. A worklet reading continuously from one queue has no such boundaries.
//
// A "prime a cushion before playing" variant that re-armed on every dry-out was tried here —
// reverted because re-priming on a normal MID-utterance dry-out (not just the start) meant
// rebuilding that cushion before resuming, which can take longer than real-time and surfaced
// as sentences stalling mid-way. But the underlying problem it was trying to fix is real and
// confirmed to predate that attempt entirely: the very first response of a call — Azure's
// audio streams in live as it generates, and the first few chunks can arrive slightly slower
// than real-time playback consumes them — produces a few audible micro-dropouts right at the
// very start ("wel...come"), before steady-state streaming catches up. So: prime ONCE, only
// for the first-ever chunk of this call (a fresh processor instance is created per call, so
// this naturally never re-arms for later responses in the same call), then behave exactly
// like the plain version for everything after — any later dry-out is just a brief gap, same
// as it always was, never a forced rebuild.
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.readOffset = 0;
    this.bufferedSamples = 0;
    this.priming = true;
    this.primeSamples = Math.round(sampleRate * 0.08); // 80ms, once, ever, for this call

    this.port.onmessage = (event) => {
      if (event.data === "clear") {
        this.queue = [];
        this.current = null;
        this.readOffset = 0;
        return;
      }
      const chunk = new Float32Array(event.data);
      this.queue.push(chunk);
      if (this.priming) {
        this.bufferedSamples += chunk.length;
        if (this.bufferedSamples >= this.primeSamples) this.priming = false;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    // Only ever true before the first chunk of the call has built its one-time cushion.
    if (this.priming) return true;

    for (let i = 0; i < output.length; i++) {
      if (!this.current || this.readOffset >= this.current.length) {
        this.current = this.queue.shift() || null;
        this.readOffset = 0;
      }
      // Web Audio zero-initializes `output`, so once the queue runs dry we just stop
      // writing and the rest of this render quantum is silence — a gap if the network
      // can't keep up, never a click, since there's no node boundary involved. Never
      // re-primes from here — that's what caused the mid-sentence stalling regression.
      if (!this.current) break;
      output[i] = this.current[this.readOffset++];
    }

    return true; // keep this processor alive for the life of the call
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
