/**
 * Call Recorder — captures inbound (user) and outbound (AI) audio during a call.
 *
 * Audio is stored as a timeline of 8kHz 16-bit mono PCM chunks, each tagged
 * with a timestamp offset. At call end the timeline is mixed into a single
 * WAV file (mono, 8kHz) and saved to MongoDB GridFS.
 *
 * The Recording document is then updated with the GridFS file ID so the
 * /api/v1/calls/:id/audio endpoint can stream it back.
 *
 * Sample rate: 8000 Hz | Bit depth: 16-bit signed LE | Channels: 1
 * 1 second = 16000 bytes of raw PCM
 */

const logger = require('../utils/logger');
const storage = require('./storage');
const Recording = require('../models/recording.model');

// Max recording size: 10 minutes × 60s × 16000 bytes/s = 9.6 MB
const MAX_RECORDING_BYTES = 10 * 60 * 16000;
const SAMPLE_RATE = 8000;
const BYTES_PER_SAMPLE = 2;

// ── WAV header builder ────────────────────────────────────────────────────────
function buildWavHeader(pcmByteLength) {
  const header = Buffer.alloc(44);
  const totalSize = pcmByteLength + 36;

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(totalSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);           // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20);            // AudioFormat (PCM = 1)
  header.writeUInt16LE(1, 22);            // NumChannels (mono)
  header.writeUInt32LE(SAMPLE_RATE, 24);  // SampleRate
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28); // ByteRate
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32); // BlockAlign
  header.writeUInt16LE(16, 34);           // BitsPerSample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcmByteLength, 40);
  return header;
}

// ── Per-call recorder state ───────────────────────────────────────────────────
const recorders = new Map(); // callSid → { timeline, totalBytes, startedAt }

function start(callSid) {
  if (!callSid || recorders.has(callSid)) return;
  recorders.set(callSid, {
    timeline: [],      // [{type: 'in'|'out', timeMs, pcm: Buffer}]
    totalBytes: 0,
    startedAt: Date.now()
  });
}

/**
 * Add a decoded PCM chunk to the inbound (user) track.
 * Called once per audio frame from processAudioChunk.
 */
function addInbound(callSid, pcmBuffer, timeMs) {
  const rec = recorders.get(callSid);
  if (!rec || rec.totalBytes >= MAX_RECORDING_BYTES) return;
  rec.timeline.push({ type: 'in', timeMs, pcm: pcmBuffer });
  rec.totalBytes += pcmBuffer.length;
}

/**
 * Add a TTS PCM buffer to the outbound (AI) track.
 * Called when TTS audio is about to be sent.
 */
function addOutbound(callSid, pcmBuffer, timeMs) {
  const rec = recorders.get(callSid);
  if (!rec || rec.totalBytes >= MAX_RECORDING_BYTES) return;
  rec.timeline.push({ type: 'out', timeMs, pcm: pcmBuffer });
  rec.totalBytes += pcmBuffer.length;
}

/**
 * Mix the timeline into a single flat WAV buffer and save to GridFS.
 * Returns the GridFS file URL or null on failure.
 */
async function finalize(callSid, callDbId) {
  const rec = recorders.get(callSid);
  recorders.delete(callSid);

  if (!rec || rec.timeline.length === 0) {
    logger.warn('[recorder] No audio to save for', callSid);
    return null;
  }

  try {
    // Determine total duration from last timeline entry
    const last = rec.timeline[rec.timeline.length - 1];
    const totalMs = last.timeMs + Math.round((last.pcm.length / BYTES_PER_SAMPLE / SAMPLE_RATE) * 1000);
    const totalSamples = Math.ceil((totalMs / 1000) * SAMPLE_RATE);
    const totalPcmBytes = Math.min(totalSamples * BYTES_PER_SAMPLE, MAX_RECORDING_BYTES);

    // Allocate silence buffer for full duration
    const pcmMix = Buffer.alloc(totalPcmBytes, 0);

    // Paste each chunk at its timestamp offset
    for (const chunk of rec.timeline) {
      const offsetBytes = Math.floor((chunk.timeMs / 1000) * SAMPLE_RATE) * BYTES_PER_SAMPLE;
      const copyLen = Math.min(chunk.pcm.length, totalPcmBytes - offsetBytes);
      if (offsetBytes >= 0 && copyLen > 0) {
        chunk.pcm.copy(pcmMix, offsetBytes, 0, copyLen);
      }
    }

    // Build WAV
    const wav = Buffer.concat([buildWavHeader(pcmMix.length), pcmMix]);
    const durationSec = Math.round(rec.timeline.reduce((acc, c) =>
      acc + (c.pcm.length / BYTES_PER_SAMPLE / SAMPLE_RATE), 0));

    const filename = `recordings/${callSid}_${Date.now()}.wav`;
    const fileUrl = await storage.uploadBuffer(wav, filename, 'audio/wav');

    logger.log(`[recorder] Saved ${(wav.length / 1024).toFixed(0)}KB WAV for ${callSid} (${durationSec}s)`);

    // Extract GridFS file ID from URL: /api/v1/files/<id>
    const fileId = fileUrl.split('/').pop();

    // Upsert Recording document
    if (callDbId) {
      await Recording.findOneAndUpdate(
        { callId: callDbId },
        {
          callId: callDbId,
          callSid,
          fileId,
          url: fileUrl,
          durationSec,
          sizeBytes: wav.length,
          contentType: 'audio/wav',
          sampleRate: SAMPLE_RATE
        },
        { upsert: true, new: true }
      );
    }

    return fileUrl;
  } catch (err) {
    logger.error('[recorder] Failed to finalize recording:', err.message);
    return null;
  }
}

module.exports = { start, addInbound, addOutbound, finalize };
