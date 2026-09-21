function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(audioBuffer) {
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const numChannels = audioBuffer.numberOfChannels;

  const channelData = [];
  for (let c = 0; c < numChannels; c++) channelData.push(audioBuffer.getChannelData(c));

  const mono = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) sum += channelData[c][i];
    mono[i] = sum / numChannels;
  }

  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Gemini's audio understanding API only accepts WAV/MP3/AIFF/AAC/OGG/FLAC,
 * but MediaRecorder produces WebM/Opus in most browsers — so we decode and
 * re-encode as WAV client-side before uploading.
 */
export async function blobToWavBlob(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioContextClass();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return encodeWav(audioBuffer);
  } finally {
    audioCtx.close();
  }
}
