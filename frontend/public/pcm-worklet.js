// Runs on the dedicated audio rendering thread, not the main thread — unlike the
// ScriptProcessorNode this replaces, it can't be starved by React renders or WebSocket/JSON
// work happening at the same time, which was producing the choppy/unclear mic capture.
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = 2048; // ~85ms at 24kHz — small enough to feel responsive, large enough to keep message overhead low
    this.buffer = new Int16Array(this.chunkSize);
    this.offset = 0;
  }

  process(inputs) {
    const channelData = inputs[0]?.[0];
    if (channelData) {
      for (let i = 0; i < channelData.length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        this.buffer[this.offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;

        if (this.offset >= this.chunkSize) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(this.chunkSize);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
