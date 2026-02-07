// Very small VAD: detect silence vs speech by RMS threshold.
// This is not production-grade but usable as initial filter.
function rms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function isSpeech(samples, threshold = 0.01) {
  return rms(samples) > threshold;
}

module.exports = { rms, isSpeech };
