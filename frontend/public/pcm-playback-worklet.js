// A single continuous audio stream instead of many separate AudioBufferSourceNodes (one
// per delta chunk) chained back-to-back. Chaining nodes — even with perfect timing and zero
// gaps between them — can still produce an audible click/crackle at each chunk boundary,
// because the waveform itself has a tiny discontinuity where one buffer's samples end and
// the next's begin. A worklet reading continuously from one queue has no such boundaries.
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.readOffset = 0;

    this.port.onmessage = (event) => {
      if (event.data === "clear") {
        this.queue = [];
        this.current = null;
        this.readOffset = 0;
        return;
      }
      this.queue.push(new Float32Array(event.data));
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    for (let i = 0; i < output.length; i++) {
      if (!this.current || this.readOffset >= this.current.length) {
        this.current = this.queue.shift() || null;
        this.readOffset = 0;
      }
      // Web Audio zero-initializes `output`, so once the queue runs dry we just stop
      // writing and the rest of this render quantum is silence — a gap if the network
      // can't keep up, never a click, since there's no node boundary involved.
      if (!this.current) break;
      output[i] = this.current[this.readOffset++];
    }

    return true; // keep this processor alive for the life of the call
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
