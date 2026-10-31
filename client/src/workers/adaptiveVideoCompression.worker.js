import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

const AUDIO_BITRATE = 128_000;
const CONTAINER_RESERVE_BITS_PER_SECOND = 80_000;
const MAX_VIDEO_BITRATE = 35_000_000;
const MAX_ENCODING_PASSES = 2;

let cancelled = false;
let activeConversion = null;

function postProgress(progress, attempt = 0) {
  if (cancelled) return;
  const start = attempt === 0 ? 0 : attempt === 1 ? 85 : 96;
  const span = attempt === 0 ? 85 : attempt === 1 ? 11 : 3;
  self.postMessage({
    type: "progress",
    progress: Math.max(0, Math.min(99, Math.round(start + progress * span))),
  });
}

async function readMetadata(file, estimateFrameRate = false) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) {
      throw new Error("This video format cannot be read for optimization.");
    }

    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No readable video track was found.");

    const [width, height] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
    ]);
    let duration = await track.getDurationFromMetadata();
    // Some MOV/WebM files omit useful duration metadata. Only those clips need
    // the more expensive packet scan.
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = await track.computeDuration();
    }

    if (
      !Number.isFinite(width) || width <= 0 ||
      !Number.isFinite(height) || height <= 0 ||
      !Number.isFinite(duration) || duration <= 0
    ) {
      throw new Error("Spotli could not determine the video's dimensions or duration.");
    }

    let frameRate = null;
    let frameRateProbeMs = 0;
    if (estimateFrameRate) {
      const probeStartedAt = performance.now();
      let timeResolution = Number.NaN;
      try {
        // Time resolution is cheap metadata and gives an upper bound on FPS.
        timeResolution = Number(await track.getTimeResolution());
      } catch {
        // Older/unusual formats may not expose time resolution; use metrics below.
      }

      if (Number.isFinite(timeResolution) && timeResolution > 0 && timeResolution <= 30.5) {
        // Standard 24/25/30 FPS clips skip the packet-sampling probe.
        frameRate = timeResolution;
      } else {
        try {
          // Only high-time-resolution sources need the more expensive sample
          // probe, so 50/60 FPS uploads can still be capped at 30 FPS.
          const metrics = await track.computeFrameRateMetrics({ targetPacketCount: 256 });
          const estimated = Number(metrics?.bestGuessFrameRate);
          if (Number.isFinite(estimated) && estimated > 0) frameRate = estimated;
        } catch {
          // Frame-rate probing is optional; preserve the source rate if unknown.
        }
      }
      frameRateProbeMs = Math.round(performance.now() - probeStartedAt);
    }

    return { width, height, duration, frameRate, frameRateProbeMs };
  } finally {
    await input.dispose?.();
  }
}

function bitrateFloorForMaxDimension(maxDimension) {
  if (maxDimension >= 3840) return 2_400_000;
  if (maxDimension >= 2560) return 1_800_000;
  if (maxDimension >= 1920) return 1_250_000;
  if (maxDimension >= 1280) return 700_000;
  if (maxDimension >= 854) return 350_000;
  return 250_000;
}

function evenDimension(value) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function getResolutionCandidates(width, height, allowDownscale, prefer720p = false) {
  const originalMax = Math.max(width, height);
  const original = {
    width: null,
    height: null,
    displayWidth: Math.round(width),
    displayHeight: Math.round(height),
    maxDimension: originalMax,
    scaled: false,
  };

  if (!allowDownscale || originalMax <= 1280) return [original];

  // Every scaled candidate uses the same scale factor for width and height,
  // preserving aspect ratio and portrait orientation.
  const caps = prefer720p ? [1280, 854, 640, 1920] : [1920, 1280, 854, 640];
  const scaledCandidates = [];
  const seen = new Set();
  for (const cap of caps) {
    if (originalMax <= cap) continue;
    const scale = cap / originalMax;
    const candidate = {
      width: evenDimension(width * scale),
      height: evenDimension(height * scale),
      displayWidth: evenDimension(width * scale),
      displayHeight: evenDimension(height * scale),
      maxDimension: cap,
      scaled: true,
    };
    const key = `${candidate.width}x${candidate.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scaledCandidates.push(candidate);
  }

  // Preserve source resolution for moderate videos. Large sources explicitly
  // opt into the speed-first profile and try 720p (or lower if needed) first.
  return prefer720p ? [...scaledCandidates, original] : [original, ...scaledCandidates];
}

async function encodeAtBitrate(
  file,
  videoBitrate,
  dimensions,
  attempt,
  outputFrameRate,
  hardwareAccelerationPreference,
  hardwareAccelerationPreferenceSource,
) {
  if (cancelled) throw new Error("UPLOAD_CANCELLED");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "fragmented" }),
    target,
  });
  let conversion;

  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    let sourceAudioCodec = null;
    try {
      sourceAudioCodec = audioTrack ? await audioTrack.getCodec() : null;
    } catch {
      sourceAudioCodec = null;
    }
    const canCopyAacAudio = sourceAudioCodec === "aac";

    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      // Let Mediabunny copy compatible audio instead of decoding and encoding
      // it needlessly. Video still transcodes because forceTranscode is true.
      copy: { mode: "preferred" },
      video: {
        codec: "avc",
        bitrate: videoBitrate,
        ...(Number.isFinite(outputFrameRate) ? { frameRate: outputFrameRate } : {}),
        ...(dimensions?.scaled
          ? {
              width: dimensions.width,
              height: dimensions.height,
              fit: "contain",
            }
          : {}),
        // Preserve display transformation metadata for rotated/portrait videos.
        // The large-video speed profile may request hardware acceleration,
        // but WebCodecs treats this as a hint and the browser may ignore it.
        hardwareAcceleration: hardwareAccelerationPreference,
        allowTransformationMetadata: true,
        forceTranscode: true,
      },
      // If the source is already AAC, omit audio options so compatible packets
      // can be copied. Re-encode only non-AAC or unknown audio to AAC.
      ...(audioTrack && !canCopyAacAudio
        ? { audio: { codec: "aac", bitrate: AUDIO_BITRATE, forceTranscode: true } }
        : {}),
      showWarnings: true,
    });

    console.info("[Spotli upload] encoder configuration", {
      videoBitrate,
      frameRateCap: Number.isFinite(outputFrameRate) ? outputFrameRate : null,
      sourceAudioCodec: sourceAudioCodec || "unknown",
      audioMode: !audioTrack ? "no-audio-track" : canCopyAacAudio ? "copy-compatible-aac" : "re-encode-aac",
      hardwareAccelerationPreference,
      hardwareAccelerationPreferenceSource,
      pass: attempt + 1,
    });

    if (!conversion.isValid) {
      throw new Error(
        "This browser cannot encode the selected video as MP4/H.264 with audio.",
      );
    }

    conversion.onProgress = (progress) => {
      if (cancelled) {
        void conversion.cancel?.().catch(() => {});
        return;
      }
      postProgress(Math.max(0, Math.min(1, progress)), attempt);
    };

    activeConversion = conversion;
    await conversion.execute();
    if (cancelled) throw new Error("UPLOAD_CANCELLED");

    const buffer = target.buffer;
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      throw new Error("Video optimization produced an empty file.");
    }
    return buffer;
  } finally {
    if (activeConversion === conversion) activeConversion = null;
    try {
      await input.dispose?.();
    } catch {
      // Cleanup failures must not mask the encoding result.
    }
  }
}

self.onmessage = async (event) => {
  const message = event.data || {};

  if (message.type === "cancel") {
    cancelled = true;
    try {
      await activeConversion?.cancel?.();
    } catch {
      // The caller terminates the worker as a final cancellation fallback.
    }
    return;
  }

  if (message.type !== "compress" || !(message.file instanceof Blob)) return;

  cancelled = false;
  const startedAt = performance.now();

  try {
    if (typeof VideoEncoder === "undefined") {
      throw new Error("This browser does not support WebCodecs video encoding.");
    }

    const file = message.file;
    const requestedTargetBytes = Number(message.targetBytes);
    const maxOutputBytes = Number(message.maxOutputBytes);
    const allowDownscale = message.allowDownscale === true;
    const prefer720p = message.prefer720p === true;
    if (
      !Number.isSafeInteger(requestedTargetBytes) || requestedTargetBytes < 1 ||
      !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 ||
      requestedTargetBytes > maxOutputBytes
    ) {
      throw new Error("Spotli received an invalid video optimization target.");
    }

    const metadataStartedAt = performance.now();
    const {
      width,
      height,
      duration,
      frameRate: sourceFrameRate,
      frameRateProbeMs,
    } = await readMetadata(file, prefer720p);
    const metadataMs = Math.round(performance.now() - metadataStartedAt);
    if (cancelled) throw new Error("UPLOAD_CANCELLED");

    // Downsample only high-frame-rate large videos. Standard 24/25/30 FPS clips
    // keep their native temporal smoothness; 50/60 FPS clips avoid encoding
    // twice as many frames on the user's device.
    const outputFrameRate = prefer720p && sourceFrameRate > 30.5 ? 30 : undefined;
    // Let the browser select the best available path by default. Hardware
    // acceleration is a hint and can have higher startup cost on some devices;
    // the URL override remains available for controlled A/B testing.
    const requestedHardwarePreference = message.hardwareAccelerationPreference;
    const hardwareAccelerationPreference =
      requestedHardwarePreference === "prefer-hardware" || requestedHardwarePreference === "no-preference"
        ? requestedHardwarePreference
        : "no-preference";
    const hardwareAccelerationPreferenceSource =
      requestedHardwarePreference === hardwareAccelerationPreference
        ? "url-ab-override"
        : "browser-default-no-preference";

    // Account for a minimum practical bitrate, including AAC audio and MP4
    // overhead. For long clips, the smallest realistic output may be larger
    // than the requested target. Raise the target instead of wasting CPU in
    // repeated encodes that cannot reach the original target.
    const minimumVideoBitrate = allowDownscale
      ? bitrateFloorForMaxDimension(640)
      : bitrateFloorForMaxDimension(Math.max(width, height));
    const minimumPracticalTargetBytes = Math.ceil(
      ((minimumVideoBitrate + AUDIO_BITRATE + CONTAINER_RESERVE_BITS_PER_SECOND) * duration) /
        (8 * 0.90),
    );
    const targetBytes = Math.max(requestedTargetBytes, minimumPracticalTargetBytes);
    if (targetBytes > maxOutputBytes) {
      throw new Error(
        "This video is too long to fit under Cloudinary's upload limit at the minimum quality settings. Try a shorter clip.",
      );
    }
    if (targetBytes >= file.size * 0.90) {
      throw new Error(
        "Compressing this video would save less than 10%; uploading the original is faster.",
      );
    }

    if (targetBytes > requestedTargetBytes) {
      self.postMessage({
        type: "info",
        message: "Adjusted the target size to preserve practical video and audio quality for this duration.",
        requestedTargetBytes,
        effectiveTargetBytes: targetBytes,
      });
    }

    // The budget leaves room for audio and MP4/container overhead. For larger
    // sources, downscaling is available if required to meet the smaller target.
    const sourceAverageBitrate = (file.size * 8) / duration;
    const budgetTotalBitrate = (targetBytes * 8 * 0.90) / duration;
    const budgetVideoBitrate =
      budgetTotalBitrate - AUDIO_BITRATE - CONTAINER_RESERVE_BITS_PER_SECOND;
    const candidates = getResolutionCandidates(width, height, allowDownscale, prefer720p);
    let chosenDimensions = null;
    let qualityFloorBitrate = 0;
    for (const candidate of candidates) {
      const floor = bitrateFloorForMaxDimension(candidate.maxDimension);
      const proposedBitrate = Math.floor(
        Math.min(sourceAverageBitrate * 0.92, budgetVideoBitrate, MAX_VIDEO_BITRATE),
      );
      if (proposedBitrate >= floor) {
        chosenDimensions = candidate;
        qualityFloorBitrate = floor;
        break;
      }
    }

    if (!chosenDimensions) {
      throw new Error(
        allowDownscale
          ? "This video cannot fit under the configured Cloudinary limit without very aggressive compression. Try a shorter clip."
          : "Compression would reduce this video's bitrate too much, so Spotli will upload the original instead.",
      );
    }

    let usedBitrate = Math.floor(
      Math.min(sourceAverageBitrate * 0.92, budgetVideoBitrate, MAX_VIDEO_BITRATE),
    );
    if (!Number.isFinite(usedBitrate) || usedBitrate < qualityFloorBitrate) {
      throw new Error("The selected video cannot be compressed safely at this target size.");
    }

    let buffer = null;
    let encodeMs = 0;
    let encodingPasses = 0;
    for (let attempt = 0; attempt < MAX_ENCODING_PASSES; attempt += 1) {
      const encodeStartedAt = performance.now();
      buffer = await encodeAtBitrate(
        file,
        usedBitrate,
        chosenDimensions,
        attempt,
        outputFrameRate,
        hardwareAccelerationPreference,
        hardwareAccelerationPreferenceSource,
      );
      encodeMs += Math.round(performance.now() - encodeStartedAt);
      encodingPasses += 1;
      if (buffer.byteLength <= targetBytes) break;
      // The size target optimizes the transfer, but it isn't the hard Cloudinary
      // limit. If the first encode is already safe to upload, accept it instead
      // of spending another minute re-encoding just to shave off a few MiB.
      if (buffer.byteLength <= maxOutputBytes) break;
      if (attempt === MAX_ENCODING_PASSES - 1) break;

      const correction = Math.min(0.88, (maxOutputBytes / buffer.byteLength) * 0.90);
      const correctedBitrate = Math.floor(
        Math.min(usedBitrate * correction, MAX_VIDEO_BITRATE),
      );
      if (correctedBitrate < qualityFloorBitrate) break;
      usedBitrate = correctedBitrate;
    }

    if (cancelled) throw new Error("UPLOAD_CANCELLED");
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      throw new Error("Video optimization produced an empty file.");
    }
    if (buffer.byteLength >= file.size) {
      throw new Error("Video optimization did not reduce the file size.");
    }
    if (buffer.byteLength > maxOutputBytes) {
      throw new Error(
        `Optimized video is ${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MiB, which exceeds the configured Cloudinary upload limit. Try a shorter video.`,
      );
    }

    const fileNameBase =
      String(file.name || "spotli-video").replace(/\.[^.]+$/, "") || "spotli-video";
    const elapsedMs = Math.round(performance.now() - startedAt);
    const outputSizeBytes = buffer.byteLength;

    console.info("[Spotli upload] compression finished", {
      timestamp: new Date().toISOString(),
      originalSizeBytes: file.size,
      compressedSizeBytes: outputSizeBytes,
      targetBytes,
      savingsPercent: Number((((file.size - outputSizeBytes) / file.size) * 100).toFixed(1)),
      targetVideoBitrate: usedBitrate,
      sourceDisplayDimensions: `${Math.round(width)}x${Math.round(height)}`,
      sourceFrameRate: Number.isFinite(sourceFrameRate) ? Number(sourceFrameRate.toFixed(2)) : null,
      outputFrameRate: Number.isFinite(outputFrameRate) ? outputFrameRate : (Number.isFinite(sourceFrameRate) ? Number(sourceFrameRate.toFixed(2)) : null),
      outputDimensions: `${chosenDimensions.displayWidth}x${chosenDimensions.displayHeight}`,
      dimensionsReduced: chosenDimensions.scaled,
      preferredResolutionProfile: prefer720p ? "speed-720p" : "quality-first",
      hardwareAccelerationPreference,
      hardwareAccelerationPreferenceSource,
      durationSeconds: duration,
      metadataMs,
      frameRateProbeMs,
      encodeMs,
      encodingPasses,
      elapsedMs,
    });

    self.postMessage(
      {
        type: "complete",
        buffer,
        fileName: `${fileNameBase}-optimized.mp4`,
        elapsedMs,
        metadataMs,
        frameRateProbeMs,
        encodeMs,
        encodingPasses,
        originalSizeBytes: file.size,
        outputSizeBytes,
        targetBytes,
        targetVideoBitrate: usedBitrate,
        width: chosenDimensions.displayWidth,
        height: chosenDimensions.displayHeight,
        sourceFrameRate: Number.isFinite(sourceFrameRate) ? Number(sourceFrameRate.toFixed(2)) : null,
        outputFrameRate: Number.isFinite(outputFrameRate) ? outputFrameRate : (Number.isFinite(sourceFrameRate) ? Number(sourceFrameRate.toFixed(2)) : null),
        dimensionsReduced: chosenDimensions.scaled,
        preferredResolutionProfile: prefer720p ? "speed-720p" : "quality-first",
        hardwareAccelerationPreference,
        hardwareAccelerationPreferenceSource,
      },
      [buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error?.message === "UPLOAD_CANCELLED"
          ? "UPLOAD_CANCELLED"
          : error?.error?.message || error?.message || "Video optimization failed.",
    });
  } finally {
    activeConversion = null;
  }
};
