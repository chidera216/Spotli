import {
  useEffect as tablet_useEffect,
  useLayoutEffect as tablet_useLayoutEffect,
  useRef as tablet_useRef,
  useState as tablet_useState,
  useCallback as tablet_useCallback,
  useMemo as tablet_useMemo,
} from "react";
import tablet_CommentSection from "./comments/CommentSection";
import tablet_api from "../services/api";
import {
  ArrowLeft as tablet_ArrowLeft,
  Heart as tablet_Heart,
  MessageCircle as tablet_MessageCircle,
  Share2 as tablet_Share2,
  MoreVertical as tablet_MoreVertical,
  Play as tablet_Play,
  Pause as tablet_Pause,
  Volume2 as tablet_Volume2,
  VolumeX as tablet_VolumeX,
  Maximize as tablet_Maximize,
  Settings as tablet_Settings,
  Captions as tablet_Captions,
  Bookmark as tablet_Bookmark,
  Trash2 as tablet_Trash2,
  ChevronUp as tablet_ChevronUp,
  ChevronDown as tablet_ChevronDown,
} from "lucide-react";
import MentionText from "./MentionText";
import { getRecentVideoPlaybackUrl } from "../utils/recentVideoPlaybackCache";

const MIN_AUTOMATIC_QUALITY_HEIGHT = 1030;
const DESKTOP_AUTO_MIN_HEIGHT = 720;
let nextSpotliPlaybackDiagnosticId = 0;

// Keep enough browser Resource Timing entries to compare several feed videos
// in one Airtel/MTN test session. This affects diagnostics only, not playback.
try {
  if (
    typeof performance !== "undefined" &&
    performance.setResourceTimingBufferSize
  ) {
    performance.setResourceTimingBufferSize(1000);
  }
} catch {
  // Resource Timing buffer sizing is optional and must never affect playback.
}

function getSpotliHighResolutionNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getSpotliResourceTiming(url) {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByName !== "function" ||
    !url
  ) {
    return null;
  }

  try {
    const entries = performance
      .getEntriesByName(url, "resource")
      .filter((entry) => entry.entryType === "resource")
      .sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));
    if (!entries.length) return null;

    const roundMs = (value) =>
      Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
    const delta = (end, start) => {
      const endValue = Number(end) || 0;
      const startValue = Number(start) || 0;
      return endValue > 0 && startValue > 0
        ? roundMs(Math.max(0, endValue - startValue))
        : null;
    };
    const toTimingRecord = (entry) => {
      const timing = {
        startTimeMs: roundMs(Number(entry.startTime) || 0),
        durationMs: roundMs(Number(entry.duration) || 0),
        dnsMs: delta(entry.domainLookupEnd, entry.domainLookupStart),
        connectMs: delta(entry.connectEnd, entry.connectStart),
        tlsMs:
          Number(entry.secureConnectionStart) > 0
            ? delta(entry.connectEnd, entry.secureConnectionStart)
            : null,
        requestWaitMs: delta(entry.responseStart, entry.requestStart),
        responseTransferMs: delta(entry.responseEnd, entry.responseStart),
        startToFirstByteMs: delta(entry.responseStart, entry.startTime),
        transferSizeBytes: Number(entry.transferSize) || 0,
        encodedBodySizeBytes: Number(entry.encodedBodySize) || 0,
        decodedBodySizeBytes: Number(entry.decodedBodySize) || 0,
        nextHopProtocol: entry.nextHopProtocol || null,
        initiatorType: entry.initiatorType || null,
        responseStatus: Number(entry.responseStatus) || null,
        serverTiming: Array.isArray(entry.serverTiming)
          ? entry.serverTiming.map((item) => ({
              name: item.name,
              durationMs: roundMs(Number(item.duration) || 0),
              description: item.description || "",
            }))
          : [],
      };
      timing.timingFieldsVisible =
        timing.requestWaitMs != null ||
        timing.dnsMs != null ||
        timing.connectMs != null;
      return timing;
    };

    const records = entries.map(toTimingRecord);
    const last = records[records.length - 1];
    const sumKnown = (key) => {
      const known = records
        .map((record) => record[key])
        .filter((value) => Number.isFinite(value) && value > 0);
      return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
    };
    const origin = (() => {
      try {
        return new URL(url, document.baseURI).origin;
      } catch {
        return "";
      }
    })();
    const crossOrigin = Boolean(
      origin && typeof location !== "undefined" && origin !== location.origin,
    );
    const timingFieldsVisible = records.some(
      (record) => record.timingFieldsVisible,
    );
    const sizeFieldsVisible = records.some(
      (record) =>
        record.transferSizeBytes > 0 ||
        record.encodedBodySizeBytes > 0 ||
        record.decodedBodySizeBytes > 0,
    );

    return {
      requestCount: records.length,
      // Preserve the original field names for existing HLS diagnostics.
      durationMs: last.durationMs,
      responseWaitMs: last.requestWaitMs,
      responseTransferMs: last.responseTransferMs,
      transferSizeBytes: records.reduce(
        (sum, record) => sum + record.transferSizeBytes,
        0,
      ),
      encodedBodySizeBytes: records.reduce(
        (sum, record) => sum + record.encodedBodySizeBytes,
        0,
      ),
      decodedBodySizeBytes: records.reduce(
        (sum, record) => sum + record.decodedBodySizeBytes,
        0,
      ),
      nextHopProtocol: last.nextHopProtocol,
      timingAvailable: timingFieldsVisible,
      timingVisibility: timingFieldsVisible
        ? "visible"
        : crossOrigin
          ? "cross-origin-restricted-or-cache"
          : "timing-not-exposed",
      sizeFieldsVisible,
      totalKnownDnsMs: sumKnown("dnsMs"),
      totalKnownConnectMs: sumKnown("connectMs"),
      totalKnownTlsMs: sumKnown("tlsMs"),
      totalKnownRequestWaitMs: sumKnown("requestWaitMs"),
      totalKnownResponseTransferMs: sumKnown("responseTransferMs"),
      totalKnownStartToFirstByteMs: sumKnown("startToFirstByteMs"),
      // Keep only the most recent five records so logs stay readable.
      recentRequests: records.slice(-5),
    };
  } catch {
    return null;
  }
}

function getSpotliResourceTimingLogFields(resourceTiming) {
  if (!resourceTiming) {
    return {
      cloudinaryResourceRequestCount: 0,
      cloudinaryResourceTimingVisibility: "no-resource-entry-yet",
      cloudinaryRequestWaitMs: null,
      cloudinaryResponseTransferMs: null,
      cloudinaryTransferBytes: null,
    };
  }

  return {
    cloudinaryResourceRequestCount: resourceTiming.requestCount,
    cloudinaryResourceTimingVisibility: resourceTiming.timingVisibility,
    cloudinaryDnsMs: resourceTiming.totalKnownDnsMs,
    cloudinaryConnectMs: resourceTiming.totalKnownConnectMs,
    cloudinaryTlsMs: resourceTiming.totalKnownTlsMs,
    cloudinaryRequestWaitMs: resourceTiming.totalKnownRequestWaitMs,
    cloudinaryResponseTransferMs: resourceTiming.totalKnownResponseTransferMs,
    cloudinaryStartToFirstByteMs: resourceTiming.totalKnownStartToFirstByteMs,
    cloudinaryTransferBytes: resourceTiming.transferSizeBytes || null,
    cloudinaryEncodedBytes: resourceTiming.encodedBodySizeBytes || null,
    cloudinaryDecodedBytes: resourceTiming.decodedBodySizeBytes || null,
    cloudinaryProtocol: resourceTiming.nextHopProtocol,
  };
}

function getSpotliBufferedAheadSeconds(video) {
  if (!video?.buffered?.length) return 0;
  const currentTime = Number(video.currentTime) || 0;
  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);
    if (currentTime >= start - 0.15 && currentTime <= end + 0.15) {
      return Math.max(0, end - currentTime);
    }
  }
  return 0;
}

// Spotli quality tiers are orientation-neutral: landscape 1832x1030 and
// portrait 1030x1832 both represent the 1030p tier. HLS level.height alone
// mislabels portrait renditions as 1832p and can make the player miss them.
function getQualityTierHeight(level) {
  const width = Number(level?.width) || 0;
  const height = Number(level?.height) || 0;
  if (width > 0 && height > 0) return Math.min(width, height);
  return height;
}

function getPostOwnerId(post) {
  const creator = post?.creator;
  const user = post?.user;
  // Feed normalization may store the creator's display name in `creator`;
  // prefer explicit owner IDs before considering legacy string creator values.
  return (
    post?.creatorId ||
    post?.authorId ||
    post?.userId ||
    creator?._id ||
    creator?.id ||
    (typeof user === "string" ? user : user?._id || user?.id) ||
    (typeof creator === "string" ? creator : "") ||
    ""
  );
}

function isPostOwnedBy(post, currentUserId) {
  const ownerId = getPostOwnerId(post);
  return Boolean(
    ownerId && currentUserId && String(ownerId) === String(currentUserId),
  );
}

function getSavedPlaybackPreference(key, fallback) {
  try {
    const saved = JSON.parse(
      localStorage.getItem("spotli.settings.preferences") || "{}",
    );
    return saved[key] ?? fallback;
  } catch {
    return fallback;
  }
}

// Parse the canonical Spotli Cloudinary asset path. Stored URLs may include
// transformation segments (including single-segment transforms like q_auto),
// streaming profiles, or a version prefix. Build new URLs from the public ID
// rather than stacking transformations or accidentally treating them as part
// of the public ID.
function getSpotliCloudinaryAssetParts(value) {
  if (
    typeof value !== "string" ||
    !/^https?:\/\/res\.cloudinary\.com\//i.test(value)
  ) {
    return null;
  }

  const marker = "/video/upload/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;

  const pathStart = markerIndex + marker.length;
  const pathOnly = value.slice(pathStart).split(/[?#]/, 1)[0];
  const segments = pathOnly.split("/").filter(Boolean);
  const publicIdIndex = segments.findIndex(
    (segment, index) => segment === "spotli" && segments[index + 1] === "posts",
  );

  // The app's video uploads are stored under spotli/posts. If this isn't one
  // of our canonical assets, don't guess at a URL that might be invalid.
  if (publicIdIndex < 0) return null;

  const version = segments
    .slice(0, publicIdIndex)
    .reverse()
    .find((segment) => /^v\d+$/.test(segment));
  const assetPath = [
    ...(version ? [version] : []),
    ...segments.slice(publicIdIndex),
  ].join("/");

  const lastAssetSegment = segments[segments.length - 1] || "";
  const formatMatch = lastAssetSegment.match(/\.([a-z0-9]+)$/i);
  const sourceFormat = formatMatch ? formatMatch[1].toLowerCase() : "";

  return {
    base: value.slice(0, pathStart),
    assetPath,
    sourceFormat,
    assetPathWithoutExtension: assetPath.replace(
      /\.(mp4|mov|m4v|webm|avi|mkv|m3u8|mpd)$/i,
      "",
    ),
  };
}

// A direct progressive URL is safe only when Cloudinary's stored source format
// is actually MP4. Spotli also accepts MOV and WebM uploads (especially small
// files that intentionally skip browser compression); forcing those assets to
// a .mp4 URL produces 404s, after which the player waits for HLS or a fallback.
function getDirectSpotliMp4Url(value) {
  const parts = getSpotliCloudinaryAssetParts(value);
  if (!parts || parts.sourceFormat !== "mp4") return "";

  // Use the original verified Cloudinary URL path, including its actual version
  // and format. Do not invent an MP4 extension for a MOV/WebM or extensionless
  // public ID.
  return `${parts.base}${parts.assetPath}`;
}

function getOptimizedPlaybackUrl(value) {
  const parts = getSpotliCloudinaryAssetParts(value);
  if (!parts) return value;

  // Browser-compressed Spotli uploads are MP4. For a video just published in
  // this SPA session, play the exact prepared File from a local Blob URL first.
  const directMp4Url = getDirectSpotliMp4Url(value);
  if (directMp4Url) {
    const canonicalAssetPath = parts.assetPathWithoutExtension.replace(
      /^v\d+\//i,
      "",
    );
    const recentLocalUrl = getRecentVideoPlaybackUrl(canonicalAssetPath);
    if (recentLocalUrl) return recentLocalUrl;
  }

  // Never use the uploaded original as the progressive fallback. Weak mobile
  // playback uses an upload-time bitrate tier selected from measured downlink.
  // Desktop Auto keeps its 720p floor, including on weak networks and Data
  // Saver, so it never uses the small mobile derivatives.
  const networkProfile = getNetworkPlaybackProfile();
  const fallbackHeight = networkProfile.progressiveFallbackHeight;
  const veryLowBandwidth =
    !networkProfile.desktopPlayback &&
    (networkProfile.dataSaver || networkProfile.weakNetwork);
  // Desktop fallback must use the exact derivative queued by
  // server/src/utils/cloudinaryHls.js: 1280x1280 c_limit, 800k, auto:eco,
  // H.264 MP4. Requesting 1600k/2500k or auto:good here creates a different
  // transformation that Cloudinary may have to generate on the first failure
  // path, making the fallback look like another playback failure.
  const desktopEagerFallback = Boolean(networkProfile.desktopPlayback);
  const desktopFastEagerFallback = Boolean(
    desktopEagerFallback && networkProfile.fastDesktop,
  );

  // Keep the mobile output near the 480p class when bandwidth allows, but
  // lower both bitrate and maximum dimension on very slow links. Mobile tiers
  // remain unchanged by the desktop progressive-startup path.
  const maxDimension = desktopFastEagerFallback
    ? 1920
    : desktopEagerFallback
      ? 1280
      : veryLowBandwidth
        ? networkProfile.progressiveFallbackMaxDimension || 854
        : fallbackHeight <= 480
          ? 854
          : fallbackHeight <= 720
            ? 1280
            : 1920;

  // Desktop Auto now starts from an upload-time eager MP4 instead of waiting
  // through HLS playlist/segment setup. Normal/weak desktop uses the matching
  // 720p-class derivative (400k/500k/800k by measured network); fast desktop
  // uses the 1080p-class 1600k one.
  // Mobile keeps its existing network-aware upload-time bitrate ladder.
  const maxBitrate = desktopEagerFallback
    ? getDesktopProgressiveBitrate(networkProfile)
    : veryLowBandwidth
      ? networkProfile.progressiveFallbackBitrate || "300k"
      : fallbackHeight <= 480
        ? "500k"
        : fallbackHeight <= 720
          ? "800k"
          : "2500k";

  // All eager MP4 fallback variants use auto:eco. Keep the requested URL
  // identical to the desktop eager transformation so Cloudinary can serve the
  // existing derivative instead of creating a new one during playback.
  const playbackQuality = "auto:eco";
  const transformation = `br_${maxBitrate},c_limit,f_mp4,h_${maxDimension},q_${playbackQuality},vc_h264,w_${maxDimension}`;
  const inputAssetPath = `${parts.assetPathWithoutExtension}.mp4`;
  return `${parts.base}${transformation}/${inputAssetPath}`;
}

// Reuse the actual next feed card's video element for MP4 preloading. The
// buffer-gated queue promotes only the immediate next card; this exact element
// becomes the active player after a swipe and stops speculative loading once
// its first decoded frame is ready.
const feedVideoPreloadStates = new WeakMap();
const activeFeedVideoPreloadStates = new Set();
let feedVideoPreloadsAllowed = false;

// Pause speculative feed-card MP4 requests whenever the active player
// on mobile, tablet or desktop is buffering or has lost its safety buffer. Sources are kept attached: no
// src removal or load() call is made while yielding, so a partial preload can
// resume without discarding the element's already received media bytes.
function setFeedVideoPreloadPriority(
  allowed,
  activeVideo = null,
  reason = "buffer-policy",
) {
  feedVideoPreloadsAllowed = Boolean(allowed);

  for (const state of activeFeedVideoPreloadStates) {
    const candidateVideo = state?.videoElement;
    if (
      !candidateVideo ||
      candidateVideo === activeVideo ||
      !state.firstFrameOnly ||
      candidateVideo.readyState >= 2
    ) {
      continue;
    }

    if (!feedVideoPreloadsAllowed && !state.yieldedForActivePlayback) {
      state.yieldedForActivePlayback = true;
      state.aggressive = false;
      try {
        candidateVideo.pause();
        candidateVideo.preload = "metadata";
        candidateVideo.setAttribute("preload", "metadata");
      } catch {}
      console.info(
        "[Spotli playback] Yielding next-video MP4 preload to active playback",
        {
          postId: state.postId || null,
          asset: state.assetKey || null,
          priority: state.priority || "next-video",
          reason,
          readyState: candidateVideo.readyState,
          networkState: candidateVideo.networkState,
          currentSourcePreserved: Boolean(
            candidateVideo.currentSrc || candidateVideo.getAttribute("src"),
          ),
        },
      );
      continue;
    }

    if (feedVideoPreloadsAllowed && state.yieldedForActivePlayback) {
      state.yieldedForActivePlayback = false;
      state.aggressive = true;
      try {
        candidateVideo.preload = "auto";
        candidateVideo.setAttribute("preload", "auto");
        // Only call load() when the browser has not started this attached
        // source at all. Never reset an idle/in-flight request with partial data.
        if (
          candidateVideo.readyState === 0 &&
          candidateVideo.networkState === 0
        ) {
          candidateVideo.load();
        }
      } catch {}
      console.info(
        "[Spotli playback] Resuming next-video MP4 preload after buffer recovery",
        {
          postId: state.postId || null,
          asset: state.assetKey || null,
          priority: state.priority || "next-video",
          reason,
          readyState: candidateVideo.readyState,
          networkState: candidateVideo.networkState,
        },
      );
    }
  }
}

// Tracks progressive MP4 media retained when any Auto feed card becomes
// inactive. The same DOM element can be verified and resumed instead of
// trusting a log flag or rebuilding its media source.
const retainedProgressiveMedia = new WeakMap();
const retainedDesktopInflightMp4Requests = new Map();
const MAX_RETAINED_DESKTOP_INFLIGHT_MP4_REQUESTS = 2;

function trackRetainedDesktopInflightMp4Request(video, record) {
  retainedDesktopInflightMp4Requests.delete(video);
  retainedDesktopInflightMp4Requests.set(video, record);

  while (
    retainedDesktopInflightMp4Requests.size >
    MAX_RETAINED_DESKTOP_INFLIGHT_MP4_REQUESTS
  ) {
    const oldestEntry = retainedDesktopInflightMp4Requests
      .entries()
      .next().value;
    if (!oldestEntry) break;

    const [oldVideo] = oldestEntry;
    retainedDesktopInflightMp4Requests.delete(oldVideo);

    // If the old request is still waiting for its first metadata response,
    // cancel it to avoid allowing many abandoned videos to compete with the
    // currently active desktop video. Completed/metadata-ready sources stay
    // attached in their own per-post element for later resume.
    if (
      oldVideo !== video &&
      oldVideo?.isConnected &&
      oldVideo.readyState === 0 &&
      oldVideo.networkState === 2 &&
      !oldVideo.error
    ) {
      try {
        oldVideo.pause();
        oldVideo.removeAttribute("src");
        oldVideo.load();
        retainedProgressiveMedia.delete(oldVideo);
      } catch {}
      console.info(
        "[Spotli playback] Evicted oldest pending desktop MP4 request to protect active playback",
        {
          postId: oldVideo.dataset?.postId || null,
          retainedPendingLimit: MAX_RETAINED_DESKTOP_INFLIGHT_MP4_REQUESTS,
        },
      );
    }
  }
}

// HLS recovery streams can still be retained per post when progressive MP4
// delivery fails. Keep a small LRU cache so recovery does not rebuild a stream
// unnecessarily; normal desktop Auto now uses retained progressive MP4 instead.
const retainedDesktopHlsControllers = new Map();
const MAX_RETAINED_DESKTOP_HLS_CONTROLLERS = 3;

function storeRetainedDesktopHlsController(video, controller) {
  retainedDesktopHlsControllers.delete(video);
  retainedDesktopHlsControllers.set(video, controller);

  while (
    retainedDesktopHlsControllers.size > MAX_RETAINED_DESKTOP_HLS_CONTROLLERS
  ) {
    const oldestEntry = retainedDesktopHlsControllers.entries().next().value;
    if (!oldestEntry) break;
    const [oldVideo, oldController] = oldestEntry;
    retainedDesktopHlsControllers.delete(oldVideo);
    try {
      oldController.destroy?.();
    } catch (error) {
      console.warn(
        "[Spotli playback] Could not release an expired retained desktop HLS player",
        error,
      );
    }
  }
}

function createFeedVideoReadinessWatch(videoElement, sourceUrl, state) {
  const watchStartedAt = Date.now();
  let settled = false;
  let timerId = null;
  let lastProgressLogAt = 0;
  let previousBufferedAhead = 0;
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const cleanup = () => {
    if (timerId != null) clearTimeout(timerId);
    videoElement.removeEventListener("loadstart", onLoadStart);
    videoElement.removeEventListener("loadedmetadata", onMetadata);
    videoElement.removeEventListener("loadeddata", onData);
    videoElement.removeEventListener("canplay", onData);
    videoElement.removeEventListener("progress", onProgress);
    videoElement.removeEventListener("stalled", onStalled);
    videoElement.removeEventListener("error", onError);
  };

  const settle = (ready) => {
    if (settled) return;
    settled = true;
    cleanup();
    activeFeedVideoPreloadStates.delete(state);

    if (ready) {
      if (state.firstFrameOnly) {
        // The feed's own video element becomes the active player after a swipe.
        // Stop speculative fetching at HAVE_CURRENT_DATA and leave its decoded
        // first frame attached for VideoViewer to reuse.
        try {
          videoElement.pause();
          videoElement.preload = "metadata";
          videoElement.setAttribute("preload", "metadata");
        } catch {}
      }
      const resourceTiming = getSpotliResourceTiming(sourceUrl);
      const transferBytes = Number(resourceTiming?.transferSizeBytes) || null;
      console.info("[Spotli playback] Next feed MP4 frame data ready", {
        postId: state.postId || null,
        asset: state.assetKey || null,
        priority: state.priority || "next-video",
        elapsedMs: Date.now() - watchStartedAt,
        preloadMode: videoElement.preload,
        readyState: videoElement.readyState,
        networkState: videoElement.networkState,
        bufferedRanges: videoElement.buffered?.length || 0,
        currentTime: Number(videoElement.currentTime) || 0,
        transferBytes,
        transferBytesMayBeUnavailableForCrossOrigin: transferBytes == null,
        resourceTiming,
        ...getSpotliResourceTimingLogFields(resourceTiming),
      });
    } else {
      const mediaErrorCode = videoElement.error?.code || null;
      const failureReason = mediaErrorCode
        ? {
            1: "media-aborted",
            2: "network-error",
            3: "decode-error",
            4: "unsupported-source",
          }[mediaErrorCode] || "media-error"
        : "first-frame-data-timeout";
      if (mediaErrorCode) state.failed = true;
      console.warn(
        `[Spotli playback] Next feed MP4 preload ${mediaErrorCode ? "failed" : "still loading"} (${failureReason})`,
        {
          elapsedMs: Date.now() - watchStartedAt,
          mediaErrorCode,
          networkState: videoElement.networkState,
          readyState: videoElement.readyState,
          postId: state.postId || null,
          asset: state.assetKey || null,
          source: sourceUrl,
          keepingSourceAttached: !mediaErrorCode,
        },
      );
    }
    resolvePromise(ready);
  };

  const onLoadStart = () => {
    console.info("[Spotli playback] Next feed MP4 request started", {
      postId: state.postId || null,
      asset: state.assetKey || null,
      priority: state.priority || "next-video",
      elapsedMs: Date.now() - watchStartedAt,
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
      preloadMode: videoElement.preload,
    });
  };
  const onMetadata = () => {
    console.info("[Spotli playback] Next feed MP4 metadata available", {
      elapsedMs: Date.now() - watchStartedAt,
      readyState: videoElement.readyState,
      preloadMode: videoElement.preload,
    });
  };
  const onData = () => {
    if (videoElement.readyState >= 2) settle(true);
  };
  const onProgress = () => {
    const now = Date.now();
    if (now - lastProgressLogAt < 1200) return;
    lastProgressLogAt = now;
    const bufferedAheadSeconds = getSpotliBufferedAheadSeconds(videoElement);
    const resourceTiming = getSpotliResourceTiming(sourceUrl);
    console.info("[Spotli playback] Next feed MP4 network progress", {
      postId: state.postId || null,
      asset: state.assetKey || null,
      priority: state.priority || "next-video",
      elapsedMs: now - watchStartedAt,
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
      bufferedAheadSeconds: Math.round(bufferedAheadSeconds * 100) / 100,
      bufferGrowthSincePreviousProgressSeconds:
        Math.round((bufferedAheadSeconds - previousBufferedAhead) * 100) / 100,
      preloadMode: videoElement.preload,
      resourceTiming,
      ...getSpotliResourceTimingLogFields(resourceTiming),
    });
    previousBufferedAhead = bufferedAheadSeconds;
  };
  const onStalled = () => {
    const resourceTiming = getSpotliResourceTiming(sourceUrl);
    console.warn("[Spotli playback] Next feed MP4 network stalled", {
      postId: state.postId || null,
      asset: state.assetKey || null,
      priority: state.priority || "next-video",
      elapsedMs: Date.now() - watchStartedAt,
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
      bufferedAheadSeconds:
        Math.round(getSpotliBufferedAheadSeconds(videoElement) * 100) / 100,
      resourceTiming,
      ...getSpotliResourceTimingLogFields(resourceTiming),
    });
  };
  const onError = () => settle(false);

  videoElement.addEventListener("loadstart", onLoadStart, { once: true });
  videoElement.addEventListener("loadedmetadata", onMetadata, { once: true });
  videoElement.addEventListener("loadeddata", onData, { once: true });
  videoElement.addEventListener("canplay", onData, { once: true });
  videoElement.addEventListener("progress", onProgress);
  videoElement.addEventListener("stalled", onStalled);
  videoElement.addEventListener("error", onError, { once: true });
  timerId = setTimeout(() => settle(false), 12000);
  if (videoElement.readyState >= 2) settle(true);

  return {
    promise,
    cleanup,
    settle,
    get settled() {
      return settled;
    },
  };
}

function preloadFeedVideoElement(
  value,
  videoElement,
  {
    aggressive = true,
    firstFrameOnly = false,
    postId = null,
    priority = "next-video",
  } = {},
) {
  if (!videoElement || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  const sourceUrl = getOptimizedPlaybackUrl(value);
  if (typeof sourceUrl !== "string" || !sourceUrl) {
    return Promise.resolve(false);
  }

  let state = feedVideoPreloadStates.get(videoElement);
  if (state?.sourceUrl === sourceUrl) {
    if (firstFrameOnly) state.firstFrameOnly = true;
    if (postId != null) state.postId = String(postId);
    if (priority) state.priority = priority;
    console.info("[Spotli playback] Reusing shared next-feed MP4 preload", {
      postId: state.postId || null,
      asset: state.assetKey || null,
      priority: state.priority || "next-video",
      readyState: videoElement.readyState,
      networkState: videoElement.networkState,
      preloadMode: videoElement.preload,
    });
    if (state.failed) return Promise.resolve(false);

    if (videoElement.readyState >= 2) {
      if (state.firstFrameOnly) {
        try {
          videoElement.pause();
          videoElement.preload = "metadata";
          videoElement.setAttribute("preload", "metadata");
        } catch {}
      }
      state.watcher?.settle(true);
      return Promise.resolve(true);
    }

    if (aggressive && !state.aggressive && feedVideoPreloadsAllowed) {
      state.aggressive = true;
      state.yieldedForActivePlayback = false;
      videoElement.preload = "auto";
      videoElement.setAttribute("preload", "auto");
      // Restart only an empty element. An idle/partially loaded request may
      // already have reusable bytes and must not be reset with load().
      const requestRestarted =
        videoElement.readyState === 0 && videoElement.networkState === 0;
      if (requestRestarted) {
        try {
          videoElement.load();
        } catch {}
      }
      console.info("[Spotli playback] Promoted next feed MP4 element to auto", {
        readyState: videoElement.readyState,
        networkState: videoElement.networkState,
        requestRestarted,
        sourceStillAttached: Boolean(
          videoElement.currentSrc || videoElement.getAttribute("src"),
        ),
      });
    }

    // A previous 12-second watchdog only records that the request is still
    // pending; it must not permanently leave this element without readiness
    // listeners. Re-arm the watcher without touching the in-flight request.
    if (!state.watcher || state.watcher.settled) {
      activeFeedVideoPreloadStates.add(state);
      state.watcher = createFeedVideoReadinessWatch(
        videoElement,
        sourceUrl,
        state,
      );
      state.promise = state.watcher.promise;
    }
    return state.promise || Promise.resolve(false);
  }

  // If this card was previously used for another post/source, detach only the
  // old listeners. Assigning the new source below replaces that old request.
  if (state) {
    activeFeedVideoPreloadStates.delete(state);
    state.cleanup?.();
  }

  const currentSource =
    videoElement.currentSrc || videoElement.getAttribute("src") || "";
  let currentMatches = false;
  try {
    currentMatches =
      Boolean(currentSource) &&
      new URL(currentSource, document.baseURI).href ===
        new URL(sourceUrl, document.baseURI).href;
  } catch {
    currentMatches = currentSource === sourceUrl;
  }

  videoElement.muted = true;
  videoElement.playsInline = true;
  // The next-video queue calls this only after the active video has headroom.
  // firstFrameOnly uses auto just until loadeddata, then pauses and demotes to
  // metadata so the same element is ready for the swipe without fetching the clip.
  videoElement.preload = aggressive ? "auto" : "metadata";
  videoElement.setAttribute("preload", aggressive ? "auto" : "metadata");

  const assetKey =
    getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension || null;
  state = {
    sourceUrl,
    assetKey,
    videoElement,
    postId: postId == null ? null : String(postId),
    priority,
    aggressive,
    firstFrameOnly,
    yieldedForActivePlayback: false,
    failed: false,
    promise: null,
    watcher: null,
    cleanup: null,
  };
  feedVideoPreloadStates.set(videoElement, state);
  activeFeedVideoPreloadStates.add(state);
  state.watcher = createFeedVideoReadinessWatch(videoElement, sourceUrl, state);
  state.promise = state.watcher.promise;
  state.cleanup = () => {
    activeFeedVideoPreloadStates.delete(state);
    state.watcher?.cleanup();
  };

  if (!currentMatches) {
    videoElement.src = sourceUrl;
    videoElement.dataset.spotliPreloadSrc = sourceUrl;
    videoElement.load();
  } else if (videoElement.readyState < 1 && videoElement.networkState !== 2) {
    // React may have assigned src while this card was inactive with preload=none.
    // Explicitly start the request now that this is the next preload target.
    videoElement.load();
  }

  if (videoElement.readyState >= 2) state.watcher.settle(true);
  console.info("[Spotli playback] Priming next feed video element", {
    postId: state.postId || null,
    asset: state.assetKey || null,
    priority: state.priority || "next-video",
    preloadMode: videoElement.preload,
    firstFrameOnly: state.firstFrameOnly,
    sourceIsLocal: sourceUrl.startsWith("blob:"),
    sourceAlreadyAttached: currentMatches,
    readyState: videoElement.readyState,
    networkState: videoElement.networkState,
  });
  return state.promise;
}

function preloadNextVideoPlayback(value, options = {}) {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return Promise.resolve(false);

  const networkProfile = getNetworkPlaybackProfile();
  const policy = getUpcomingVideoChunkPreloadPolicy(networkProfile);

  // Auto playback prewarms the exact progressive MP4 URL on the actual
  // inactive per-post video element for every form factor. This is the same
  // element that becomes active after a swipe, so no HLS playlist/segment
  // rebuild is needed and the first decoded frame/buffer can be reused.
  if (options.videoElement) {
    const optimizedSourceUrl = getOptimizedPlaybackUrl(value);
    const existingState = feedVideoPreloadStates.get(options.videoElement);
    if (!feedVideoPreloadsAllowed) {
      if (existingState?.sourceUrl === optimizedSourceUrl) {
        return (
          existingState.promise ||
          Promise.resolve(options.videoElement.readyState >= 2)
        );
      }
      console.info(
        "[Spotli playback] Deferring feed MP4 preload until active buffer is healthy",
        {
          postId: options.postId == null ? null : String(options.postId),
          asset:
            getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension ||
            null,
          priority: options.priority || "next-video",
          desktopPlayback: networkProfile.desktopPlayback,
        },
      );
      return Promise.resolve(false);
    }
    return preloadFeedVideoElement(value, options.videoElement, {
      aggressive: true,
      firstFrameOnly: true,
      postId: options.postId,
      priority: options.priority || "next-video",
    });
  }

  // Auto playback must not warm a detached HLS copy. Desktop, tablet and mobile
  // all require the actual feed element so the viewer can inherit its source.
  if (networkProfile.desktopPlayback) {
    console.info(
      "[Spotli playback] Skipping desktop HLS prewarm without reusable feed element",
      {
        postId: options.postId == null ? null : String(options.postId),
        asset:
          getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension ||
          null,
        priority: options.priority || "next-video",
      },
    );
    return Promise.resolve(false);
  }
  if (!networkProfile.desktopPlayback) {
    console.info(
      "[Spotli playback] Skipping mobile preload without the reusable feed element",
      {
        postId: options.postId == null ? null : String(options.postId),
        asset:
          getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension ||
          null,
        priority: options.priority || "next-video",
      },
    );
    return Promise.resolve(false);
  }
  const requestedFirstSegment = options.includeFirstSegment === true;
  const partialBytes = Math.max(
    0,
    Math.min(
      HLS_WARM_PARTIAL_CACHE_MAX_ENTRY_BYTES,
      Number(options.partialBytes) ||
        (requestedFirstSegment ? policy.segmentBytes : 0),
    ),
  );

  if (networkProfile.constrained && !partialBytes) {
    console.info(
      "[Spotli playback] Skipping speculative media bytes without a chunk budget",
      {
        dataSaver: networkProfile.dataSaver,
        constrained: networkProfile.constrained,
        downlinkMbps: networkProfile.downlinkMbps,
      },
    );
    return Promise.resolve(false);
  }

  // Speculative preloading is byte-capped. Full media segments are reserved for
  // explicit user intent, such as pressing a video card.
  const hlsWarmPromise = preloadCloudinaryVideoStream(value, "auto", {
    partialBytes,
    initBytes: policy.initBytes,
  });

  if (!partialBytes || options.fallbackMp4OnWarmFailure === false) {
    return Promise.resolve(hlsWarmPromise);
  }

  return Promise.resolve(hlsWarmPromise).then((prepared) => {
    if (prepared === true) return true;
    if (options.videoElement) {
      return preloadFeedVideoElement(value, options.videoElement, {
        aggressive: false,
      });
    }
    return false;
  });
}

// Return the same lightweight Cloudinary first-frame thumbnail used by the
// Home grid. Reusing the exact URL lets the browser's image cache carry the
// preview into the viewer while the HLS stream is attaching and buffering.
function getCloudinaryVideoThumbnailUrl(value, width = 720, height = 405) {
  if (typeof value !== "string" || !value.trim()) return "";

  const url = value.trim();
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(url)) return "";

  const marker = "/video/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return "";

  const pathStart = markerIndex + marker.length;
  let assetPath = url.slice(pathStart).split(/[?#]/, 1)[0];
  const firstSegment = assetPath.split("/")[0];

  // Strip any existing transformation segment rather than stacking another.
  if (firstSegment.includes(",")) {
    assetPath = assetPath.slice(firstSegment.length).replace(/^\/+/, "");
  }

  assetPath = assetPath.replace(/\.(mp4|mov|m4v|webm|avi|mkv)$/i, "");
  if (!assetPath || !assetPath.includes("/")) return "";

  return `${url.slice(0, pathStart)}so_0,w_${width},h_${height},c_fill,q_auto,f_jpg/${assetPath}.jpg`;
}

function getExplicitPostThumbnail(post) {
  const candidates = [
    post?.customThumbnail,
    post?.thumbnailUrl,
    post?.thumbnail,
    post?.posterUrl,
    post?.poster,
    post?.previewImage,
    post?.coverImage,
    post?.imageUrl,
    post?.image,
  ];

  for (const value of candidates) {
    const candidate =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? value.url ||
            value.src ||
            value.imageUrl ||
            value.secure_url ||
            value.path ||
            ""
          : "";

    if (typeof candidate !== "string" || !candidate.trim()) continue;
    // Never mistake an MP4/MOV/WebM source URL for a still-image poster.
    if (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(candidate)) continue;
    return candidate.trim();
  }

  return "";
}

function getCloudinaryHlsUrl(value) {
  const parts = getSpotliCloudinaryAssetParts(value);
  if (!parts || !parts.assetPathWithoutExtension) return "";

  // Spotli contains portrait and landscape uploads. Cloudinary's predefined
  // full_hd profile is fixed to 16:9 and applies a fit/crop transformation when
  // the source aspect ratio differs. sp_auto chooses an orientation-aware
  // ladder where 720p is measured on the shorter edge (720x1280 portrait or
  // 1280x720 landscape), and never upscales a source below that size.
  // Keep this in sync with CLOUDINARY_HLS_STREAMING_PROFILE on the server.
  return `${parts.base}sp_auto/${parts.assetPathWithoutExtension}.m3u8`;
}

// All Auto playback uses the actual per-post progressive MP4 element for
// predictable startup and instant resume. HLS is now a recovery fallback only,
// so detached Home HLS prewarming is unnecessary on every form factor.
export function shouldSkipDetachedHlsPrewarmForAuto() {
  return true;
}

// Backwards-compatible export for callers still using the earlier name.
export function shouldSkipHlsPrewarmForMobileAuto() {
  return shouldSkipDetachedHlsPrewarmForAuto();
}

// Detect connection characteristics for startup rendition and buffering
// policy. Auto favors the best rendition the connection can sustain, then adapts.
function getNetworkPlaybackProfile() {
  const connection =
    typeof navigator !== "undefined"
      ? navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection
      : null;
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();
  const downlink = Number(connection?.downlink);
  const hasDownlink = Number.isFinite(downlink) && downlink > 0;
  const rtt = Number(connection?.rtt);
  const hasRtt = Number.isFinite(rtt) && rtt > 0;
  const saveData = connection?.saveData === true;
  const savedDataSaverPreference = getSavedPlaybackPreference(
    "dataSaver",
    null,
  );
  const dataSaverUserChoice =
    getSavedPlaybackPreference("dataSaverUserChoice", false) === true;
  const inferredDataSaver =
    saveData ||
    ["slow-2g", "2g", "3g"].includes(effectiveType) ||
    (hasDownlink && downlink < 1.2);
  const dataSaver =
    dataSaverUserChoice && typeof savedDataSaverPreference === "boolean"
      ? savedDataSaverPreference
      : inferredDataSaver;

  // Treat phones and tablets as touch devices without misclassifying a large
  // touchscreen laptop as a phone merely because it reports touch points.
  const viewportWidth =
    typeof window !== "undefined" ? Number(window.innerWidth) || 1280 : 1280;
  const coarsePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const hasTouchPoints =
    typeof navigator !== "undefined" &&
    (Number(navigator.maxTouchPoints) || 0) > 0;
  const touchDevice = Boolean(
    coarsePointer || (hasTouchPoints && viewportWidth <= 1200),
  );
  // Keep playback policy aligned with the responsive viewer: the desktop
  // layout starts at 1024px. A touchscreen laptop on desktop width still gets
  // the desktop 720p floor, while normal tablet widths retain mobile behavior.
  const desktopPlayback = !touchDevice || viewportWidth >= 1024;

  const verySlow =
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    (hasDownlink && downlink < 0.7) ||
    (hasRtt && rtt >= 900);
  const weakNetwork = Boolean(
    dataSaver ||
    saveData ||
    verySlow ||
    effectiveType === "3g" ||
    (hasDownlink && downlink < 2.0) ||
    (hasRtt && rtt >= 500),
  );
  const fastDesktop = Boolean(
    desktopPlayback &&
    !weakNetwork &&
    hasDownlink &&
    downlink >= 5.0 &&
    (!hasRtt || rtt < 500),
  );

  // Default Auto targets:
  // - Data Saver or weak mobile/tablet connection: 480p.
  // - Normal mobile/tablet and all normal/weak desktop connections: 720p.
  // - Fast desktop connection: up to 1080p.
  // Desktop deliberately keeps a 720p minimum; it never adapts down to 480p.
  // A 720p+ rendition is required for that floor. If the uploaded source has
  // no 720p+ rendition, use the highest rendition that the source provides.
  const mobileLowData = !desktopPlayback && (dataSaver || weakNetwork);
  const startupHeight = mobileLowData ? 480 : fastDesktop ? 1080 : 720;
  const progressiveFallbackHeight = mobileLowData ? 480 : startupHeight;

  // Low-bitrate progressive variants are generated eagerly by the upload
  // pipeline so weak-mobile playback doesn't pay a first-view transformation
  // cost. Sub-0.4 Mbps / 2G uses 200k; Data Saver retains its 300k / 640px
  // variant; 300k and 400k at 854px bridge weak links up to the existing 500k tier.
  let progressiveFallbackBitrate = null;
  let progressiveFallbackMaxDimension = null;
  if (mobileLowData) {
    const verySlowMobile =
      (hasDownlink && downlink < 0.4) ||
      effectiveType === "slow-2g" ||
      effectiveType === "2g";

    if (verySlowMobile) {
      progressiveFallbackBitrate = "200k";
      progressiveFallbackMaxDimension = 640;
    } else if (dataSaver) {
      progressiveFallbackBitrate = "300k";
      progressiveFallbackMaxDimension = 640;
    } else if (hasDownlink && downlink < 0.7) {
      progressiveFallbackBitrate = "300k";
      progressiveFallbackMaxDimension = 854;
    } else if (hasDownlink && downlink < 1.2) {
      progressiveFallbackBitrate = "400k";
      progressiveFallbackMaxDimension = 854;
    } else if (effectiveType === "3g" && !hasDownlink) {
      progressiveFallbackBitrate = "300k";
      progressiveFallbackMaxDimension = 854;
    } else {
      progressiveFallbackBitrate = "500k";
      progressiveFallbackMaxDimension = 854;
    }
  }

  // Keep HLS's opening rendition conservative on constrained mobile links.
  // The selected 480p/720p rendition remains consistent with the same HLS
  // prewarm bytes that the active player will reuse.
  let defaultBandwidthEstimate;
  if (dataSaver) {
    defaultBandwidthEstimate = hasDownlink
      ? Math.max(180_000, Math.min(650_000, downlink * 450_000))
      : 320_000;
  } else if (weakNetwork) {
    defaultBandwidthEstimate = hasDownlink
      ? Math.max(250_000, Math.min(1_000_000, downlink * 500_000))
      : 450_000;
  } else if (fastDesktop) {
    defaultBandwidthEstimate = hasDownlink
      ? Math.max(3_000_000, Math.min(5_000_000, downlink * 750_000))
      : 3_500_000;
  } else {
    defaultBandwidthEstimate = hasDownlink
      ? Math.max(1_400_000, Math.min(3_000_000, downlink * 750_000))
      : 1_800_000;
  }

  const startupBandwidthBudget = dataSaver
    ? hasDownlink
      ? Math.max(160_000, Math.min(500_000, downlink * 400_000))
      : 280_000
    : weakNetwork
      ? hasDownlink
        ? Math.max(220_000, Math.min(900_000, downlink * 500_000))
        : 450_000
      : fastDesktop
        ? hasDownlink
          ? Math.max(3_000_000, Math.min(5_000_000, downlink * 800_000))
          : 3_500_000
        : hasDownlink
          ? Math.max(1_800_000, Math.min(3_200_000, downlink * 800_000))
          : 2_200_000;

  // Do not download speculative next-video segments on touch devices or when
  // the connection is constrained. Desktop can still warm the next item.
  const allowSpeculativeNextSegmentPreload =
    !touchDevice &&
    !weakNetwork &&
    !saveData &&
    (!hasDownlink || downlink >= 2.0);

  return {
    touchDevice,
    desktopPlayback,
    dataSaver,
    weakNetwork,
    fastDesktop,
    startupHeight,
    progressiveFallbackHeight,
    progressiveFallbackBitrate,
    progressiveFallbackMaxDimension,
    startupBandwidthBudget,
    constrained: weakNetwork,
    saveData,
    allowSpeculativeNextSegmentPreload,
    defaultBandwidthEstimate,
    effectiveType,
    downlinkMbps: hasDownlink ? downlink : null,
    rttMs: hasRtt ? rtt : null,
  };
}

function getDesktopProgressiveBitrate(profile = getNetworkPlaybackProfile()) {
  if (profile.fastDesktop) return "1600k";
  // Keep the desktop short-edge resolution floor at 720p while using a bitrate
  // that leaves network headroom on weak connections. Resolution and bitrate
  // are independent: this does not switch desktop to a 480p rendition.
  if (profile.downlinkMbps > 0 && profile.downlinkMbps < 0.7) return "400k";
  if (profile.weakNetwork || profile.dataSaver) return "500k";
  return "800k";
}

// Choose the highest-resolution rendition within the device/network ceiling
// that fits the conservative startup budget. If the budget is too low for any
// candidate, begin with the lowest-bitrate allowed rendition and let HLS ABR
// move upward after measuring real segment throughput.
function getUpcomingVideoChunkPreloadPolicy(
  networkProfile = getNetworkPlaybackProfile(),
) {
  if (networkProfile.dataSaver || networkProfile.saveData) {
    return {
      segmentBytes: 16 * 1024,
      initBytes: 4 * 1024,
      // Start the next-video preparation sooner, but retain a meaningful
      // playback reserve and never begin the second speculative download early.
      minimumBufferedAheadSeconds: 3.5,
      secondVideoBufferedAheadSeconds: 9,
      yieldBelowBufferedAheadSeconds: 1.5,
      label: "data-saver-buffer-protected",
    };
  }
  if (networkProfile.constrained) {
    const downlink = Number(networkProfile.downlinkMbps);
    const verySlow =
      (Number.isFinite(downlink) && downlink > 0 && downlink < 0.4) ||
      ["slow-2g", "2g"].includes(networkProfile.effectiveType);
    const lowHeadroom =
      Number.isFinite(downlink) && downlink > 0 && downlink < 0.7;
    // A 0.5-0.7 Mbps mobile link can sustain the 300 kbps MP4 tier while
    // keeping a small safety reserve. A 2.5s start gate was too high: real
    // sessions hovered around 2.3s forever, so the next card never warmed.
    // Start its first-frame preload at 2.0s and still yield below 1.25s.
    const minimumBufferedAheadSeconds = verySlow
      ? 3.5
      : lowHeadroom
        ? 2.0
        : 2.2;
    return {
      segmentBytes: verySlow ? 8 * 1024 : 16 * 1024,
      initBytes: 4 * 1024,
      minimumBufferedAheadSeconds,
      secondVideoBufferedAheadSeconds: verySlow ? 10 : 8,
      yieldBelowBufferedAheadSeconds: 1.25,
      label: verySlow
        ? "very-weak-network-buffer-protected"
        : "weak-network-buffer-protected",
    };
  }
  if (networkProfile.touchDevice) {
    return {
      segmentBytes: 48 * 1024,
      initBytes: 8 * 1024,
      minimumBufferedAheadSeconds: 1.4,
      secondVideoBufferedAheadSeconds: 5,
      yieldBelowBufferedAheadSeconds: 1.1,
      label: "mobile-normal",
    };
  }
  return {
    segmentBytes: 48 * 1024,
    initBytes: 8 * 1024,
    minimumBufferedAheadSeconds: 1.4,
    secondVideoBufferedAheadSeconds: 5,
    yieldBelowBufferedAheadSeconds: 1.1,
    label: "desktop-normal",
  };
}

// These helpers intentionally live at module scope because the upcoming-video
// prewarmer is shared by the tablet/mobile and desktop viewer implementations.
// Do not call the component-local isPhotoPost/getOriginalVideoUrl helpers here:
// they are not in scope when this module-level function runs.
function getSpotliPrefetchMediaUrl(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  // Keep this priority aligned with the desktop viewer's getOriginalVideoUrl.
  // imageUrl is intentionally excluded because it may be a poster, not video.
  return (
    value.url ||
    value.src ||
    value.videoUrl ||
    value.mediaUrl ||
    value.secure_url ||
    value.path ||
    value.location ||
    ""
  )
    .toString()
    .trim();
}

function looksLikeSpotliImageUrl(value) {
  return /(?:\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#]|$)|\/image\/upload\/|^data:image\/)/i.test(
    getSpotliPrefetchMediaUrl(value),
  );
}

function looksLikeSpotliVideoUrl(value) {
  return /(?:\.(?:mp4|mov|m4v|webm|avi|mkv|m3u8|mpd)(?:[?#]|$)|\/video\/upload\/|^data:video\/)/i.test(
    getSpotliPrefetchMediaUrl(value),
  );
}

function isSpotliPrefetchPhotoPost(post) {
  if (!post) return false;

  const mediaType = String(post?.mediaType || "")
    .trim()
    .toLowerCase();
  if (["image", "photo", "photos", "gallery"].includes(mediaType)) {
    return true;
  }
  if (["video", "reel"].includes(mediaType)) return false;

  const otherTypes = [post?.type, post?.postType, post?.kind]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  if (
    otherTypes.some((type) =>
      ["image", "photo", "photos", "gallery"].includes(type),
    )
  ) {
    return true;
  }
  if (otherTypes.some((type) => ["video", "reel"].includes(type))) {
    return false;
  }

  if (
    post?.isImagePost === true ||
    post?.isPhotoPost === true ||
    String(post?.mimeType || post?.mimetype || "")
      .toLowerCase()
      .startsWith("image/")
  ) {
    return true;
  }

  const explicitVideo =
    post?.isVideoPost === true ||
    Boolean(post?.videoUrl || post?.videoFile || post?.videos?.length) ||
    [post?.video, post?.mediaUrl, post?.media, post?.mediaUrls?.[0]].some(
      looksLikeSpotliVideoUrl,
    );
  if (explicitVideo) return false;

  const ambiguousMedia = [post?.mediaUrl, post?.media, post?.mediaUrls?.[0]];
  if (ambiguousMedia.some(looksLikeSpotliImageUrl)) return true;
  if (Array.isArray(post?.photos) && post.photos.length > 0) return true;
  if (Array.isArray(post?.images) && post.images.length > 0) return true;

  return false;
}

export function getSpotliPrefetchOriginalVideoUrl(post) {
  if (!post || isSpotliPrefetchPhotoPost(post)) return "";

  const explicitCandidates = [
    post?.videoUrl,
    post?.video,
    post?.videoFile,
    Array.isArray(post?.videos) ? post.videos[0] : "",
  ];
  for (const candidate of explicitCandidates) {
    const url = getSpotliPrefetchMediaUrl(candidate);
    if (url && !looksLikeSpotliImageUrl(url)) return url;
  }

  const ambiguousCandidates = [
    post?.mediaUrl,
    post?.media,
    Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : "",
    post?.url,
  ];
  for (const candidate of ambiguousCandidates) {
    const url = getSpotliPrefetchMediaUrl(candidate);
    if (url && !looksLikeSpotliImageUrl(url)) return url;
  }

  return "";
}

function getNextVideoWarmCandidates(posts, currentIndex, limit = 2) {
  const candidates = [];
  for (
    let index = Math.max(0, Number(currentIndex) || 0) + 1;
    index < (Array.isArray(posts) ? posts.length : 0) &&
    candidates.length < limit;
    index += 1
  ) {
    const post = posts[index];
    if (!post || isSpotliPrefetchPhotoPost(post)) continue;
    const url = getSpotliPrefetchOriginalVideoUrl(post);
    if (!url || !getCloudinaryHlsUrl(url)) continue;
    candidates.push({ post, url, index });
  }
  return candidates;
}

function selectSpotliAutoStartupVariant(
  variants,
  networkProfile = getNetworkPlaybackProfile(),
) {
  const usable = (Array.isArray(variants) ? variants : []).filter(
    (variant) => Number(variant?.height) > 0,
  );
  if (!usable.length) return null;

  // Desktop Auto has a hard 720p floor. Do not let the bandwidth budget
  // select a 480p rendition on desktop; if no 720p rendition exists, use the
  // highest rendition available from that source instead.
  const desktopFloorVariants = networkProfile.desktopPlayback
    ? usable.filter(
        (variant) => Number(variant.height) >= DESKTOP_AUTO_MIN_HEIGHT,
      )
    : usable;
  const ceilingEligible = desktopFloorVariants.filter(
    (variant) => Number(variant.height) <= networkProfile.startupHeight,
  );

  if (networkProfile.desktopPlayback) {
    // Desktop Auto is quality-first: choose 720p on weak/normal connections and
    // up to 1080p on fast connections. Do not let a low bandwidth estimate pick
    // a 320p/480p opening rendition. If this asset has no 720p rendition, use
    // its highest real rendition rather than pretending a lower one is HD.
    const desktopSelectable = ceilingEligible.length
      ? ceilingEligible
      : desktopFloorVariants.length
        ? desktopFloorVariants
        : usable;
    const preferredHeight = Number(networkProfile.startupHeight) || 720;
    const exactPreferred = desktopSelectable.filter(
      (variant) => Number(variant.height) === preferredHeight,
    );
    const pool = exactPreferred.length ? exactPreferred : desktopSelectable;
    return (
      [...pool].sort((a, b) => {
        const heightDifference =
          (Number(a.height) || 0) - (Number(b.height) || 0);
        if (!exactPreferred.length && heightDifference !== 0) {
          // Prefer the closest available tier at/above 720p, not the smallest
          // bitrate. If no 720p+ rendition exists, pick the highest source tier.
          if (desktopFloorVariants.length) {
            return (Number(a.height) || 0) - (Number(b.height) || 0);
          }
          return -heightDifference;
        }
        return (
          (Number(a.bandwidth ?? a.bitrate) || Number.MAX_SAFE_INTEGER) -
          (Number(b.bandwidth ?? b.bitrate) || Number.MAX_SAFE_INTEGER)
        );
      })[0] || null
    );
  }

  const selectable = ceilingEligible.length ? ceilingEligible : usable;
  const budget = Number(networkProfile.startupBandwidthBudget) || 0;
  const withinBudget = selectable.filter((variant) => {
    const bitrate = Number(variant?.bandwidth ?? variant?.bitrate) || 0;
    return bitrate <= 0 || bitrate <= budget;
  });

  if (withinBudget.length) {
    return (
      [...withinBudget].sort(
        (a, b) =>
          (Number(b.height) || 0) - (Number(a.height) || 0) ||
          (Number(b.bandwidth ?? b.bitrate) || 0) -
            (Number(a.bandwidth ?? a.bitrate) || 0),
      )[0] || null
    );
  }

  return (
    [...selectable].sort(
      (a, b) =>
        (Number(a.bandwidth ?? a.bitrate) || Number.MAX_SAFE_INTEGER) -
          (Number(b.bandwidth ?? b.bitrate) || Number.MAX_SAFE_INTEGER) ||
        (Number(b.height) || 0) - (Number(a.height) || 0),
    )[0] || null
  );
}

// Warm only the master playlist and lightweight rendition playlist before a video
// is opened. Never prefetch media segments in the background by default: on slow
// networks those downloads can monopolize bandwidth and delay active playback.
const hlsManifestPreloads = new Map();
const hlsManifestPreloadControllers = new Map();
const hlsManifestPreloadCompleted = new Set();
const hlsManifestPreloadStartedAt = new Map();

// Share HLS playlist/segment bytes between the lightweight Home prewarmer and
// the real HLS.js player. Without this, fetch() can download a first segment
// and HLS.js immediately downloads the same segment again (especially when
// DevTools has Disable cache enabled). Keep the cache small for mobile devices.
const hlsWarmResourceCache = new Map();
const hlsWarmResourcePromises = new Map();
let hlsWarmResourceCacheBytes = 0;
// Small byte-range prefixes for the next two videos are held separately from
// complete HLS resources. Once a warmed video becomes active, the custom loader
// requests only the missing suffix and joins it to the prefetched prefix.
const hlsWarmPartialResourceCache = new Map();
// One in-flight prefix request per media URL/range start. Different callers
// (Home tap, swipe intent, viewport observer, and the two-video queue) join it.
const hlsWarmPartialResourcePromises = new Map();
// Completing a warmed prefix is also shared so the active HLS loader and any
// explicit prewarm escalation never download the same suffix twice.
const hlsWarmPartialCompletionPromises = new Map();
let hlsWarmPartialResourceCacheBytes = 0;
const HLS_WARM_PARTIAL_CACHE_MAX_BYTES = 512 * 1024;
const HLS_WARM_PARTIAL_CACHE_MAX_ENTRY_BYTES = 96 * 1024;
// Keep the one preloaded next-video segment available long enough for HLS.js
// to reuse it when that post becomes active. Some high-resolution startup fragments
// exceed 2 MB, so the old cap silently discarded them after downloading.
const HLS_WARM_CACHE_MAX_BYTES = 12 * 1024 * 1024;
const HLS_WARM_CACHE_MAX_ENTRY_BYTES = 8 * 1024 * 1024;

function getWarmResourceKey(url, type, rangeStart = null, rangeEnd = null) {
  const hasRange =
    Number.isInteger(rangeStart) &&
    Number.isInteger(rangeEnd) &&
    rangeStart >= 0 &&
    rangeEnd > rangeStart;
  return `${type}::${url}::${hasRange ? `${rangeStart}-${rangeEnd}` : "full"}`;
}

function getWarmResource(url, type, rangeStart = null, rangeEnd = null) {
  const key = getWarmResourceKey(url, type, rangeStart, rangeEnd);
  const entry = hlsWarmResourceCache.get(key);
  if (!entry || entry.type !== type) return null;
  // Refresh insertion order for simple LRU eviction.
  hlsWarmResourceCache.delete(key);
  hlsWarmResourceCache.set(key, entry);
  return entry.data;
}

function setWarmResource(url, type, data, rangeStart = null, rangeEnd = null) {
  const size = type === "text" ? data.length * 2 : data?.byteLength || 0;

  // Avoid retaining unusually large fragments in memory. They can still be
  // passed directly to a player already waiting on the shared promise.
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > HLS_WARM_CACHE_MAX_ENTRY_BYTES
  ) {
    return;
  }

  const key = getWarmResourceKey(url, type, rangeStart, rangeEnd);
  const previous = hlsWarmResourceCache.get(key);
  if (previous) {
    hlsWarmResourceCacheBytes -= previous.size;
    hlsWarmResourceCache.delete(key);
  }

  while (
    hlsWarmResourceCache.size &&
    hlsWarmResourceCacheBytes + size > HLS_WARM_CACHE_MAX_BYTES
  ) {
    const oldestKey = hlsWarmResourceCache.keys().next().value;
    const oldest = hlsWarmResourceCache.get(oldestKey);
    hlsWarmResourceCache.delete(oldestKey);
    hlsWarmResourceCacheBytes -= oldest?.size || 0;
  }

  hlsWarmResourceCache.set(key, {
    type,
    data,
    size,
    rangeStart: Number.isInteger(rangeStart) ? rangeStart : null,
    rangeEnd: Number.isInteger(rangeEnd) ? rangeEnd : null,
  });
  hlsWarmResourceCacheBytes += size;
}

function getOrLoadWarmResource(
  url,
  type,
  loader,
  rangeStart = null,
  rangeEnd = null,
) {
  const key = getWarmResourceKey(url, type, rangeStart, rangeEnd);
  const cached = getWarmResource(url, type, rangeStart, rangeEnd);
  if (cached != null) return Promise.resolve(cached);

  const inFlight = hlsWarmResourcePromises.get(key);
  if (inFlight?.type === type) return inFlight.promise;

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      const finishedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      setWarmResource(url, type, data, rangeStart, rangeEnd);
      const durationMs = Math.max(1, finishedAt - startedAt);
      const entry = hlsWarmResourceCache.get(key);
      if (entry) entry.durationMs = durationMs;
      return data;
    })
    .finally(() => {
      if (hlsWarmResourcePromises.get(key)?.promise === promise) {
        hlsWarmResourcePromises.delete(key);
      }
    });

  hlsWarmResourcePromises.set(key, { type, promise });
  return promise;
}
// Keep both playlist/segment preparations for the active video and the next
// video. A two-entry limit evicted one of those preparations before handoff.
// This remains bounded so feed-wide speculation cannot grow indefinitely.
const HLS_PREFETCH_CACHE_LIMIT = 8;

// When a video opens, stop unfinished background preloads so they do not
// compete with the active stream. Keep completed resources for the active video;
// the browser may reuse them from HTTP cache when caching is enabled.
function cancelCloudinaryVideoPreload(value, preferredQuality = "auto") {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return;
  const qualityKey =
    preferredQuality === "auto" || preferredQuality == null
      ? "auto"
      : String(preferredQuality);
  const prefix = `${hlsUrl}::${qualityKey}::`;
  for (const [key, controller] of hlsManifestPreloadControllers) {
    if (!key.startsWith(prefix)) continue;
    controller.abort();
    hlsManifestPreloadControllers.delete(key);
    hlsManifestPreloads.delete(key);
    hlsManifestPreloadCompleted.delete(key);
    hlsManifestPreloadStartedAt.delete(key);
  }
}

function cancelCloudinaryVideoPreloadsExcept(activeHlsUrl) {
  const keepPrefix = `${activeHlsUrl}::`;

  // Promote resources for the newly active video before applying the small LRU
  // cap. Otherwise preparing its next video can evict the just-prepared segment.
  for (const key of [...hlsManifestPreloads.keys()]) {
    if (!key.startsWith(keepPrefix)) continue;
    const pending = hlsManifestPreloads.get(key);
    hlsManifestPreloads.delete(key);
    hlsManifestPreloads.set(key, pending);
  }

  for (const [key, controller] of hlsManifestPreloadControllers) {
    // Keep the current video's playlist/segment preparation alive even if it is
    // still in flight. Aborting it on tap throws away the head start and can
    // force the same resources to be requested again. Cancel only other videos.
    if (key.startsWith(keepPrefix)) continue;

    controller.abort();
    hlsManifestPreloadControllers.delete(key);
    hlsManifestPreloads.delete(key);
    hlsManifestPreloadCompleted.delete(key);
    hlsManifestPreloadStartedAt.delete(key);
  }
}

async function fetchCachedText(url, signal) {
  return getOrLoadWarmResource(url, "text", async () => {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "force-cache",
      signal,
    });
    if (!response.ok)
      throw new Error(`HLS preload failed (${response.status})`);
    return response.text();
  });
}

async function warmCachedResource(resource, signal) {
  const descriptor =
    typeof resource === "string" ? { url: resource } : resource || {};
  const { url } = descriptor;
  const hasRange =
    Number.isInteger(descriptor.rangeStart) &&
    Number.isInteger(descriptor.rangeEnd) &&
    descriptor.rangeStart >= 0 &&
    descriptor.rangeEnd > descriptor.rangeStart;
  const rangeStart = hasRange ? descriptor.rangeStart : null;
  const rangeEnd = hasRange ? descriptor.rangeEnd : null;

  if (!url) throw new Error("HLS media resource URL is missing");

  return getOrLoadWarmResource(
    url,
    "arraybuffer",
    async () => {
      const partial = getWarmPartialResource(url, rangeStart ?? 0);
      const partialInFlight = getWarmPartialInFlight(url, rangeStart ?? 0);
      if (partial || partialInFlight) {
        try {
          return await completeWarmPartialResource(
            url,
            rangeStart ?? 0,
            hasRange ? rangeEnd : null,
          );
        } catch (error) {
          // If the speculative Range request was cancelled or the CDN changed
          // behavior, fall through to one ordinary request for the active media.
          console.info(
            "[Spotli playback] Prefix reuse unavailable; loading full HLS resource",
            {
              url,
              reason: error?.message || String(error || "unknown error"),
            },
          );
        }
      }

      const headers = hasRange
        ? { Range: `bytes=${rangeStart}-${rangeEnd - 1}` }
        : undefined;
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "force-cache",
        headers,
        signal,
      });
      if (!response.ok) {
        throw new Error(`HLS segment preload failed (${response.status})`);
      }
      if (hasRange && response.status !== 206) {
        try {
          await response.body?.cancel();
        } catch {}
        throw new Error("Origin did not honor the HLS byte-range request");
      }

      const data = await response.arrayBuffer();
      if (hasRange && data.byteLength !== rangeEnd - rangeStart) {
        throw new Error("HLS byte-range response length did not match request");
      }
      return data;
    },
    rangeStart,
    rangeEnd,
  );
}

function getWarmPartialResourceKey(url, rangeStart = 0) {
  return `${url}::${Number.isInteger(rangeStart) ? rangeStart : 0}`;
}

function getWarmPartialResource(url, rangeStart = 0) {
  const key = getWarmPartialResourceKey(url, rangeStart);
  const entry = hlsWarmPartialResourceCache.get(key);
  if (!entry) return null;
  hlsWarmPartialResourceCache.delete(key);
  hlsWarmPartialResourceCache.set(key, entry);
  return entry;
}

function setWarmPartialResource(url, rangeStart, data, details = {}) {
  const size = data?.byteLength || 0;
  if (
    !url ||
    !Number.isInteger(rangeStart) ||
    rangeStart < 0 ||
    size <= 0 ||
    size > HLS_WARM_PARTIAL_CACHE_MAX_ENTRY_BYTES
  )
    return;
  const key = getWarmPartialResourceKey(url, rangeStart);
  const previous = hlsWarmPartialResourceCache.get(key);
  if (previous) {
    hlsWarmPartialResourceCacheBytes -= previous.size;
    hlsWarmPartialResourceCache.delete(key);
  }
  while (
    hlsWarmPartialResourceCache.size &&
    hlsWarmPartialResourceCacheBytes + size > HLS_WARM_PARTIAL_CACHE_MAX_BYTES
  ) {
    const oldestKey = hlsWarmPartialResourceCache.keys().next().value;
    const oldest = hlsWarmPartialResourceCache.get(oldestKey);
    hlsWarmPartialResourceCache.delete(oldestKey);
    hlsWarmPartialResourceCacheBytes -= oldest?.size || 0;
  }
  hlsWarmPartialResourceCache.set(key, {
    data,
    size,
    rangeStart,
    rangeEndExclusive: rangeStart + size,
    totalLength:
      details.totalLength != null &&
      Number.isFinite(Number(details.totalLength))
        ? Number(details.totalLength)
        : null,
    durationMs: Math.max(1, Number(details.durationMs) || 1),
    storedAt: Date.now(),
  });
  hlsWarmPartialResourceCacheBytes += size;
}

function getWarmPartialInFlight(url, rangeStart = 0) {
  return (
    hlsWarmPartialResourcePromises.get(
      getWarmPartialResourceKey(url, rangeStart),
    ) || null
  );
}

async function fetchWarmPartialRange(
  url,
  rangeStart,
  rangeEndExclusive,
  signal,
) {
  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
    headers: {
      Range: `bytes=${rangeStart}-${rangeEndExclusive - 1}`,
    },
    signal,
  });

  // A CDN that ignores Range must never turn a speculative request into a
  // complete segment download.
  if (response.status !== 206) {
    try {
      await response.body?.cancel();
    } catch {}
    return null;
  }

  const data = await response.arrayBuffer();
  if (!data.byteLength || data.byteLength > rangeEndExclusive - rangeStart) {
    return null;
  }

  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (
    !match ||
    Number(match[1]) !== rangeStart ||
    Number(match[2]) + 1 !== rangeStart + data.byteLength
  ) {
    return null;
  }

  return {
    data,
    totalLength: match[3] !== "*" ? Number(match[3]) : null,
    contentRange,
  };
}

async function warmCachedResourcePrefix(
  resource,
  signal,
  maxBytes = 48 * 1024,
) {
  const descriptor =
    typeof resource === "string" ? { url: resource } : resource || {};
  const { url } = descriptor;
  const hasRange =
    Number.isInteger(descriptor.rangeStart) &&
    Number.isInteger(descriptor.rangeEnd) &&
    descriptor.rangeStart >= 0 &&
    descriptor.rangeEnd > descriptor.rangeStart;
  const rangeStart = hasRange ? descriptor.rangeStart : 0;
  const requestedBytes = Math.max(
    4 * 1024,
    Math.min(HLS_WARM_PARTIAL_CACHE_MAX_ENTRY_BYTES, Number(maxBytes) || 0),
  );
  const requestedEndExclusive = hasRange
    ? Math.min(descriptor.rangeEnd, rangeStart + requestedBytes)
    : rangeStart + requestedBytes;
  if (!url || requestedEndExclusive <= rangeStart) return false;

  const existing = getWarmPartialResource(url, rangeStart);
  if (existing?.rangeEndExclusive >= requestedEndExclusive) return true;

  const inFlight = getWarmPartialInFlight(url, rangeStart);
  if (inFlight) {
    // A larger in-flight prefix satisfies this request. If the current request
    // is smaller, wait for it and extend from its end instead of re-downloading
    // the bytes it already fetched.
    if (inFlight.requestedEndExclusive >= requestedEndExclusive) {
      return inFlight.promise;
    }
    const finished = await inFlight.promise.catch(() => false);
    const retainedPrefix = getWarmPartialResource(url, rangeStart);
    // If the earlier caller was cancelled but left a valid shorter prefix,
    // continue from its end using this caller's live signal. Never restart at 0.
    if (!finished && (!retainedPrefix || signal?.aborted)) return false;
    return warmCachedResourcePrefix(resource, signal, maxBytes);
  }

  const startedAt = getSpotliHighResolutionNow();
  const request = (async () => {
    const cachedPrefix = getWarmPartialResource(url, rangeStart);
    const suffixStart = cachedPrefix?.rangeEndExclusive ?? rangeStart;
    if (suffixStart >= requestedEndExclusive) return true;

    const responsePart = await fetchWarmPartialRange(
      url,
      suffixStart,
      requestedEndExclusive,
      signal,
    );
    if (!responsePart) return false;

    let data = responsePart.data;
    if (cachedPrefix) {
      const joined = new Uint8Array(
        cachedPrefix.data.byteLength + responsePart.data.byteLength,
      );
      joined.set(new Uint8Array(cachedPrefix.data), 0);
      joined.set(
        new Uint8Array(responsePart.data),
        cachedPrefix.data.byteLength,
      );
      data = joined.buffer;
    }

    setWarmPartialResource(url, rangeStart, data, {
      totalLength:
        responsePart.totalLength ?? cachedPrefix?.totalLength ?? null,
      durationMs: getSpotliHighResolutionNow() - startedAt,
    });

    console.info("[Spotli playback] Upcoming video byte prefix warmed", {
      kind: descriptor.kind || "media-segment",
      bytes: data.byteLength,
      requestedBytes: requestedEndExclusive - rangeStart,
      reusedPrefixBytes: cachedPrefix?.size || 0,
      hasContentRange: true,
    });
    return true;
  })().finally(() => {
    const current = hlsWarmPartialResourcePromises.get(
      getWarmPartialResourceKey(url, rangeStart),
    );
    if (current?.promise === request) {
      hlsWarmPartialResourcePromises.delete(
        getWarmPartialResourceKey(url, rangeStart),
      );
    }
  });

  hlsWarmPartialResourcePromises.set(
    getWarmPartialResourceKey(url, rangeStart),
    { requestedEndExclusive, promise: request },
  );
  return request;
}

async function completeWarmPartialResourceInternal(
  url,
  rangeStart = 0,
  rangeEnd = null,
) {
  const inFlightPrefix = getWarmPartialInFlight(url, rangeStart);
  if (inFlightPrefix) {
    await inFlightPrefix.promise.catch(() => false);
  }

  const partial = getWarmPartialResource(url, rangeStart);
  if (!partial) throw new Error("No warmed HLS byte prefix is available");

  const targetEndExclusive =
    Number.isInteger(rangeEnd) && rangeEnd > rangeStart
      ? rangeEnd
      : partial.totalLength;
  const prefixEnd = partial.rangeEndExclusive;
  if (targetEndExclusive && prefixEnd >= targetEndExclusive) {
    return partial.data.slice(0, targetEndExclusive - rangeStart);
  }

  const suffixStart = prefixEnd;
  const suffixStartedAt = getSpotliHighResolutionNow();
  const suffixRange = targetEndExclusive
    ? `bytes=${suffixStart}-${targetEndExclusive - 1}`
    : `bytes=${suffixStart}-`;
  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
    headers: { Range: suffixRange },
  });

  if (response.status === 416 && !targetEndExclusive) {
    const complete = partial.data.slice(0);
    setWarmResource(url, "arraybuffer", complete);
    return complete;
  }
  if (response.status !== 206) {
    try {
      await response.body?.cancel();
    } catch {}
    throw new Error("CDN did not honor the remaining HLS byte-range request");
  }

  const suffix = await response.arrayBuffer();
  if (!suffix.byteLength) {
    throw new Error("The remaining HLS media bytes were empty");
  }

  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match || Number(match[1]) !== suffixStart) {
    throw new Error(
      "The remaining HLS byte-range response started at the wrong offset",
    );
  }
  const expectedSuffixLength = targetEndExclusive
    ? targetEndExclusive - suffixStart
    : Number(match[2]) - suffixStart + 1;
  if (suffix.byteLength !== expectedSuffixLength) {
    throw new Error("The remaining HLS byte-range length did not match");
  }

  const prefix = targetEndExclusive
    ? partial.data.slice(0, targetEndExclusive - rangeStart)
    : partial.data;
  const output = new Uint8Array(prefix.byteLength + suffix.byteLength);
  output.set(new Uint8Array(prefix), 0);
  output.set(new Uint8Array(suffix), prefix.byteLength);
  const complete = output.buffer;
  setWarmResource(
    url,
    "arraybuffer",
    complete,
    Number.isInteger(rangeEnd) ? rangeStart : null,
    Number.isInteger(rangeEnd) ? rangeEnd : null,
  );
  const cacheKey = getWarmResourceKey(
    url,
    "arraybuffer",
    Number.isInteger(rangeEnd) ? rangeStart : null,
    Number.isInteger(rangeEnd) ? rangeEnd : null,
  );
  const entry = hlsWarmResourceCache.get(cacheKey);
  if (entry) {
    entry.durationMs = Math.max(
      1,
      partial.durationMs + (getSpotliHighResolutionNow() - suffixStartedAt),
    );
  }
  return complete;
}

function completeWarmPartialResource(url, rangeStart = 0, rangeEnd = null) {
  const key = `${getWarmPartialResourceKey(url, rangeStart)}::${
    Number.isInteger(rangeEnd) ? rangeEnd : "eof"
  }`;
  const existing = hlsWarmPartialCompletionPromises.get(key);
  if (existing) return existing;

  const request = completeWarmPartialResourceInternal(
    url,
    rangeStart,
    rangeEnd,
  ).finally(() => {
    if (hlsWarmPartialCompletionPromises.get(key) === request) {
      hlsWarmPartialCompletionPromises.delete(key);
    }
  });
  hlsWarmPartialCompletionPromises.set(key, request);
  return request;
}

// HLS.js normally has its own XHR/fetch loader, which cannot reuse an in-flight
// fetch() started by the Home prewarmer. Wrap its default loader so the actual
// player consumes the prewarmer's cached/in-flight response when URLs match.
// If there is no matching warm resource, this falls through immediately to the
// standard loader without waiting for unrelated background work.
function createWarmCacheLoader(Hls) {
  const DefaultLoader = Hls?.DefaultConfig?.loader;
  if (typeof DefaultLoader !== "function") return undefined;

  return class WarmCacheLoader extends DefaultLoader {
    constructor(config) {
      super(config);
      this.warmRequestAborted = false;
      this.warmCallbackSettled = false;
      this.warmTimeoutId = null;
    }

    load(context, config, callbacks) {
      const url = context?.url;
      const type =
        context?.responseType === "arraybuffer" ? "arraybuffer" : "text";
      const hasRange =
        Number.isInteger(context?.rangeStart) &&
        Number.isInteger(context?.rangeEnd) &&
        context.rangeStart >= 0 &&
        context.rangeEnd > context.rangeStart;
      const rangeStart = hasRange ? context.rangeStart : null;
      const rangeEnd = hasRange ? context.rangeEnd : null;
      const warmKey = getWarmResourceKey(url || "", type, rangeStart, rangeEnd);

      if (!url) return super.load(context, config, callbacks);

      // Match the exact URL and exclusive byte-range offsets used by HLS.js.
      // Whole-resource bytes are never treated as if they were a ranged body.
      const cachedData = getWarmResource(url, type, rangeStart, rangeEnd);
      const inFlight = hlsWarmResourcePromises.get(warmKey);
      const memoryCacheHit = cachedData != null;
      const inFlightCacheHit = !memoryCacheHit && inFlight?.type === type;
      const partialRangeStart = rangeStart ?? 0;
      const partialWarmEntry =
        type === "arraybuffer"
          ? getWarmPartialResource(url, partialRangeStart)
          : null;
      const partialWarmInFlight =
        type === "arraybuffer"
          ? getWarmPartialInFlight(url, partialRangeStart)
          : null;
      const partialWarmPromise =
        !memoryCacheHit &&
        !inFlightCacheHit &&
        (partialWarmEntry || partialWarmInFlight)
          ? completeWarmPartialResource(url, partialRangeStart, rangeEnd)
          : null;
      const sharedPromise = memoryCacheHit
        ? Promise.resolve(cachedData)
        : inFlightCacheHit
          ? inFlight.promise
          : partialWarmPromise;

      if (!sharedPromise) return super.load(context, config, callbacks);

      console.info(
        "[Spotli playback] Active HLS loader reused prewarmed resource",
        {
          resourceType: type,
          cacheSource: memoryCacheHit
            ? "memory"
            : inFlightCacheHit
              ? "in-flight"
              : partialWarmEntry
                ? "partial-prefix"
                : "partial-prefix-in-flight",
          bytes: memoryCacheHit
            ? type === "text"
              ? cachedData.length * 2
              : cachedData?.byteLength || 0
            : null,
          byteRange: hasRange ? `${rangeStart}-${rangeEnd - 1}` : null,
          url,
        },
      );

      this.warmRequestAborted = false;
      this.warmCallbackSettled = false;
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const configuredTimeout = Number(config?.timeout);
      const desktopHlsRequest = getNetworkPlaybackProfile().desktopPlayback;
      // Desktop HLS uses 720p+ renditions and larger media segments. A 4s
      // shared-prewarm timeout can abort a healthy but slower Cloudinary fetch,
      // then force the player into fallback while the original request is
      // still progressing. Keep mobile/tablet's previous timeout untouched.
      const desktopMinimumTimeoutMs = type === "text" ? 15_000 : 30_000;
      const timeoutMs = desktopHlsRequest
        ? Math.max(
            Number.isFinite(configuredTimeout) && configuredTimeout > 0
              ? configuredTimeout
              : 0,
            desktopMinimumTimeoutMs,
          )
        : Number.isFinite(configuredTimeout) && configuredTimeout > 0
          ? configuredTimeout
          : 4_000;
      const clearWarmTimeout = () => {
        if (this.warmTimeoutId != null) {
          clearTimeout(this.warmTimeoutId);
          this.warmTimeoutId = null;
        }
      };
      const makeEmptyStats = (finishedAt) => ({
        aborted: false,
        loaded: 0,
        total: 0,
        retry: 0,
        chunkCount: 0,
        bwEstimate: 0,
        loading: { start: startedAt, first: 0, end: finishedAt },
        parsing: { start: 0, end: 0 },
        buffering: { start: 0, first: 0, end: 0 },
      });

      // A shared fetch bypasses Hls.js's default loader, so we must enforce the
      // request timeout ourselves. This prevents a stalled Cloudinary prewarm
      // from leaving the player at HAVE_NOTHING indefinitely.
      this.warmTimeoutId = setTimeout(() => {
        if (this.warmRequestAborted || this.warmCallbackSettled) return;
        this.warmCallbackSettled = true;
        this.warmRequestAborted = true;
        const finishedAt =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        console.warn("[Spotli playback] Shared HLS request timed out", {
          url,
          type,
          timeoutMs,
        });
        callbacks.onTimeout(makeEmptyStats(finishedAt), context, null);
      }, timeoutMs);

      const loadWithDefaultLoader = () =>
        super.load(context, config, callbacks);

      sharedPromise
        .then((data) => {
          if (this.warmRequestAborted || this.warmCallbackSettled) return;
          this.warmCallbackSettled = true;
          clearWarmTimeout();

          const finishedAt =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          const byteLength =
            type === "text" ? data.length * 2 : data?.byteLength || 0;
          const cacheEntry = hlsWarmResourceCache.get(warmKey);
          const measuredDuration = cacheEntry?.durationMs || 0;
          // Don't report a near-zero load time for memory hits: that can trick ABR
          // into overestimating the real network and choosing an oversized rendition.
          const effectiveDuration =
            measuredDuration > 0
              ? measuredDuration
              : Math.max(50, ((byteLength * 8) / 350_000) * 1000);
          const loadStart = Math.max(0, finishedAt - effectiveDuration);
          const stats = {
            aborted: false,
            loaded: byteLength,
            total: byteLength,
            retry: 0,
            chunkCount: 1,
            bwEstimate: Math.max(
              100_000,
              Math.round((byteLength * 8 * 1000) / effectiveDuration),
            ),
            loading: { start: loadStart, first: loadStart, end: finishedAt },
            parsing: { start: 0, end: 0 },
            buffering: { start: 0, first: 0, end: 0 },
          };

          const completedPartialPrefix =
            type === "arraybuffer"
              ? getWarmPartialResource(url, partialRangeStart)
              : null;
          const reusedPrefixBytes = completedPartialPrefix?.size || 0;
          console.info(
            "[Spotli playback] Reused warmed HLS bytes for active playback",
            {
              resourceType: type,
              reusedBytes: byteLength,
              reusedPrefixBytes,
              fetchedSuffixBytes: Math.max(0, byteLength - reusedPrefixBytes),
              cacheSource: memoryCacheHit
                ? "memory"
                : inFlightCacheHit
                  ? "in-flight-full-resource"
                  : "partial-prefix-plus-suffix",
              url,
            },
          );
          callbacks.onSuccess(
            {
              url,
              data: type === "arraybuffer" ? data.slice(0) : data,
              code: hasRange ? 206 : 200,
            },
            stats,
            context,
            null,
          );
        })
        .catch((error) => {
          if (this.warmRequestAborted || this.warmCallbackSettled) return;
          clearWarmTimeout();
          if (
            (partialWarmPromise && !memoryCacheHit && !inFlightCacheHit) ||
            getNetworkPlaybackProfile().desktopPlayback
          ) {
            this.warmRequestAborted = true;
            console.warn(
              "[Spotli playback] Shared HLS prewarm unavailable; using the standard desktop loader",
              {
                url,
                reason: error?.message || String(error || "unknown error"),
                fallbackReason: partialWarmPromise
                  ? "partial-prefix-not-ready"
                  : "desktop-shared-resource-failed",
              },
            );
            loadWithDefaultLoader();
            return;
          }
          this.warmCallbackSettled = true;
          const finishedAt =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          const statusMatch = String(error?.message || "").match(/\((\d{3})\)/);
          const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
          console.warn("[Spotli playback] Shared HLS prewarm failed", {
            url,
            statusCode: statusCode || null,
            reason: error?.message || String(error || "unknown error"),
          });
          // Report the real failure to Hls.js instead of retrying the same 423
          // request through its default loader and delaying MP4 fallback.
          callbacks.onError(
            {
              code: statusCode,
              text: error?.message || "Shared HLS prewarm failed",
            },
            context,
            null,
            makeEmptyStats(finishedAt),
          );
        });
    }

    abort() {
      this.warmRequestAborted = true;
      if (this.warmTimeoutId != null) {
        clearTimeout(this.warmTimeoutId);
        this.warmTimeoutId = null;
      }
      super.abort();
    }

    destroy() {
      this.warmRequestAborted = true;
      if (this.warmTimeoutId != null) {
        clearTimeout(this.warmTimeoutId);
        this.warmTimeoutId = null;
      }
      super.destroy();
    }
  };
}

function resolvePlaylistUri(uri, baseUrl) {
  try {
    return new URL(uri.trim(), baseUrl).href;
  } catch {
    return "";
  }
}

function parseHlsVariants(playlistText, playlistUrl) {
  const lines = playlistText.split(/\r?\n/).map((line) => line.trim());
  const variants = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    let uriIndex = index + 1;
    while (
      uriIndex < lines.length &&
      (!lines[uriIndex] || lines[uriIndex].startsWith("#"))
    ) {
      uriIndex += 1;
    }
    if (uriIndex >= lines.length) continue;

    const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bandwidth = line.match(/(?:AVERAGE-BANDWIDTH|BANDWIDTH)=(\d+)/i);
    const width = resolution ? Number(resolution[1]) : 0;
    const rawHeight = resolution ? Number(resolution[2]) : 0;
    variants.push({
      url: resolvePlaylistUri(lines[uriIndex], playlistUrl),
      width,
      // Store the normalized quality tier, not always the portrait height.
      // Example: 1030x1832 portrait is the same tier as 1832x1030 landscape.
      height:
        width > 0 && rawHeight > 0 ? Math.min(width, rawHeight) : rawHeight,
      rawHeight,
      bandwidth: bandwidth ? Number(bandwidth[1]) : 0,
    });
  }

  return variants.filter((variant) => variant.url);
}

function parseFirstMediaResources(playlistText, playlistUrl) {
  const lines = playlistText.split(/\r?\n/).map((line) => line.trim());
  const resources = [];
  const mapLine = lines.find((line) => line.startsWith("#EXT-X-MAP:"));

  if (mapLine) {
    const uriMatch = mapLine.match(/URI="([^"]+)"/i);
    const rangeMatch = mapLine.match(/BYTERANGE="(\d+)(?:@(\d+))?"/i);
    if (uriMatch) {
      const resource = {
        kind: "init-map",
        url: resolvePlaylistUri(uriMatch[1], playlistUrl),
      };
      if (rangeMatch) {
        const length = Number(rangeMatch[1]);
        const start = rangeMatch[2] == null ? 0 : Number(rangeMatch[2]);
        if (
          Number.isSafeInteger(length) &&
          length > 0 &&
          Number.isSafeInteger(start)
        ) {
          resource.rangeStart = start;
          resource.rangeEnd = start + length;
        }
      }
      if (resource.url) resources.push(resource);
    }
  }

  let expectingSegment = false;
  let pendingByteRange = null;
  let firstSegment = null;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      pendingByteRange = line.slice(line.indexOf(":") + 1).trim();
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      expectingSegment = true;
      continue;
    }
    if (expectingSegment && line && !line.startsWith("#")) {
      const url = resolvePlaylistUri(line, playlistUrl);
      if (url) {
        firstSegment = { kind: "first-media-segment", url };
        if (pendingByteRange != null) {
          const rangeMatch = pendingByteRange.match(/^(\d+)(?:@(\d+))?$/);
          if (rangeMatch) {
            const length = Number(rangeMatch[1]);
            // An omitted offset refers to the preceding byte-range segment.
            // Since this is the first segment we can see, don't guess an offset.
            if (rangeMatch[2] != null) {
              const start = Number(rangeMatch[2]);
              if (
                Number.isSafeInteger(length) &&
                length > 0 &&
                Number.isSafeInteger(start)
              ) {
                firstSegment.rangeStart = start;
                firstSegment.rangeEnd = start + length;
              } else {
                firstSegment = null;
              }
            } else {
              firstSegment = null;
            }
          } else {
            firstSegment = null;
          }
        }
      }
      break;
    }
  }

  // Don't interpret a master-playlist child URI as a media segment if the
  // response is incomplete or does not include EXTINF media entries.
  if (!firstSegment && !lines.some((line) => line.startsWith("#EXTINF:"))) {
    return [];
  }
  if (!firstSegment) return [];
  resources.push(firstSegment);

  // Keep only the init map plus the first actual media segment.
  const seen = new Set();
  return resources
    .filter((resource) => {
      const key = getWarmResourceKey(
        resource.url,
        "arraybuffer",
        resource.rangeStart ?? null,
        resource.rangeEnd ?? null,
      );
      if (!resource.url || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

export function preloadCloudinaryVideoStream(
  value,
  preferredQuality = "auto",
  options = {},
) {
  if (typeof window === "undefined" || typeof fetch !== "function") return;

  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return;

  // Home prewarming and active playback must target the same startup rendition
  // in Auto mode so a ready resource can be reused instead of downloading a
  // larger first fragment that the connection cannot sustain.
  const parsedQuality =
    preferredQuality === "auto" || preferredQuality == null
      ? "auto"
      : String(
          Number.parseInt(String(preferredQuality).replace(/[^0-9]/g, ""), 10),
        );
  const qualityKey = parsedQuality === "NaN" ? "auto" : parsedQuality;
  // Playlist-only prewarming is the default. Next-video speculation uses a
  // byte-capped prefix that the active HLS loader can finish after a swipe.
  const includeFirstSegment = options?.includeFirstSegment === true;
  const partialBytes = Math.max(
    0,
    Math.min(
      HLS_WARM_PARTIAL_CACHE_MAX_ENTRY_BYTES,
      Number(options?.partialBytes) || 0,
    ),
  );
  const initBytes = Math.max(
    0,
    Math.min(16 * 1024, Number(options?.initBytes) || 8 * 1024),
  );
  const preloadMode =
    partialBytes > 0
      ? `chunk-${partialBytes}-${initBytes}`
      : includeFirstSegment
        ? "segment"
        : "playlist";
  const cacheKey = `${hlsUrl}::${qualityKey}::${preloadMode}`;
  const prewarmAssetKey =
    getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension || hlsUrl;

  if (hlsManifestPreloads.has(cacheKey)) {
    // Refresh insertion order on reuse so active/next-video preparations are
    // not treated as stale by the bounded request cache.
    const existing = hlsManifestPreloads.get(cacheKey);
    hlsManifestPreloads.delete(cacheKey);
    hlsManifestPreloads.set(cacheKey, existing);
    return existing;
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  if (controller) hlsManifestPreloadControllers.set(cacheKey, controller);
  hlsManifestPreloadStartedAt.set(cacheKey, Date.now());
  const signal = controller?.signal;

  const logWarmResource = (
    stage,
    resourceUrl,
    type,
    startedAt,
    details = {},
  ) => {
    const { rangeStart = null, rangeEnd = null, ...loggedDetails } = details;
    const cacheKeyForResource = getWarmResourceKey(
      resourceUrl,
      type,
      rangeStart,
      rangeEnd,
    );
    const cacheEntry = hlsWarmResourceCache.get(cacheKeyForResource);
    const dataSize =
      loggedDetails.retainedBytes ??
      cacheEntry?.size ??
      (type === "text" ? Number(loggedDetails.textLength || 0) * 2 : null);
    console.info("[Spotli playback] HLS prewarm stage", {
      stage,
      asset: prewarmAssetKey,
      elapsedMs: Math.round(getSpotliHighResolutionNow() - startedAt),
      retainedBytes: dataSize,
      retainedNetworkDurationMs: cacheEntry?.durationMs ?? null,
      memoryCacheHit: loggedDetails.memoryCacheHit ?? Boolean(cacheEntry),
      resourceTiming: getSpotliResourceTiming(resourceUrl),
      ...loggedDetails,
    });
  };

  const request = (async () => {
    const masterStartedAt = getSpotliHighResolutionNow();
    const masterWasCached = getWarmResource(hlsUrl, "text") != null;
    const masterText = await fetchCachedText(hlsUrl, signal);
    logWarmResource("master-playlist", hlsUrl, "text", masterStartedAt, {
      textLength: masterText.length,
      cacheState: masterWasCached ? "memory-cache" : "fetch-or-shared-fetch",
    });
    const variants = parseHlsVariants(masterText, hlsUrl);

    let startupVariant;

    if (qualityKey !== "auto") {
      const requestedHeight = Number(qualityKey);
      const exact = variants
        .filter((variant) => variant.height === requestedHeight)
        .sort((a, b) => b.bandwidth - a.bandwidth)[0];
      const lower = variants
        .filter(
          (variant) => variant.height > 0 && variant.height < requestedHeight,
        )
        .sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth)[0];
      const any = variants
        .filter((variant) => variant.height > 0)
        .sort(
          (a, b) =>
            Math.abs(a.height - requestedHeight) -
              Math.abs(b.height - requestedHeight) ||
            a.height - b.height ||
            b.bandwidth - a.bandwidth,
        )[0];
      startupVariant = exact || lower || any;
    } else {
      // Match the active player's network-aware Auto startup choice. This keeps
      // the warmed first segment aligned with the rendition actually requested.
      startupVariant = selectSpotliAutoStartupVariant(
        variants,
        getNetworkPlaybackProfile(),
      );
    }

    if (!startupVariant) {
      // A manifest-only prewarm is enough for off-screen mobile cards. Do not
      // download a video segment for cards the viewer may never open.
      if (includeFirstSegment || partialBytes > 0) {
        const resources = parseFirstMediaResources(masterText, hlsUrl);
        if (!resources.length) {
          throw new Error("No initial HLS media resource was found");
        }
        const results = await Promise.allSettled(
          resources.map(async (resource) => {
            const resourceStartedAt = getSpotliHighResolutionNow();
            const wasCached =
              getWarmResource(
                resource.url,
                "arraybuffer",
                resource.rangeStart ?? null,
                resource.rangeEnd ?? null,
              ) != null;
            const data =
              partialBytes > 0
                ? await warmCachedResourcePrefix(
                    resource,
                    signal,
                    resource.kind === "init-map" ? initBytes : partialBytes,
                  )
                : await warmCachedResource(resource, signal);
            logWarmResource(
              resource.kind || "first-media-resource",
              resource.url,
              "arraybuffer",
              resourceStartedAt,
              {
                loadedBytes: data?.byteLength || 0,
                partialPrefixWarmed:
                  partialBytes > 0 ? data === true : undefined,
                requestedPrefixBytes:
                  partialBytes > 0
                    ? resource.kind === "init-map"
                      ? initBytes
                      : partialBytes
                    : undefined,
                memoryCacheHit: wasCached,
                rangeStart: resource.rangeStart ?? null,
                rangeEnd: resource.rangeEnd ?? null,
                cacheState: wasCached
                  ? "memory-cache"
                  : "fetch-or-shared-fetch",
                byteRange: Number.isInteger(resource.rangeStart)
                  ? `${resource.rangeStart}-${resource.rangeEnd - 1}`
                  : null,
              },
            );
            return data;
          }),
        );
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("Could not warm the initial HLS media resource");
        }
        if (
          partialBytes > 0 &&
          !results.some(
            (result, index) =>
              resources[index]?.kind === "first-media-segment" &&
              result.status === "fulfilled" &&
              result.value === true,
          )
        ) {
          throw new Error(
            "The CDN did not provide a reusable partial media segment",
          );
        }
      }
      hlsManifestPreloadCompleted.add(cacheKey);
      return true;
    }

    const variantPlaylistStartedAt = getSpotliHighResolutionNow();
    const variantPlaylistWasCached =
      getWarmResource(startupVariant.url, "text") != null;
    const mediaPlaylistText = await fetchCachedText(startupVariant.url, signal);
    logWarmResource(
      "selected-rendition-playlist",
      startupVariant.url,
      "text",
      variantPlaylistStartedAt,
      {
        selectedResolution: `${startupVariant.width || "?"}x${startupVariant.rawHeight || startupVariant.height || "?"}`,
        qualityTierHeight: startupVariant.height || null,
        advertisedBandwidthKbps: startupVariant.bandwidth
          ? Math.round(startupVariant.bandwidth / 1000)
          : null,
        textLength: mediaPlaylistText.length,
        cacheState: variantPlaylistWasCached
          ? "memory-cache"
          : "fetch-or-shared-fetch",
      },
    );
    if (includeFirstSegment || partialBytes > 0) {
      const resources = parseFirstMediaResources(
        mediaPlaylistText,
        startupVariant.url,
      );
      if (!resources.length) {
        throw new Error("No initial HLS media resource was found");
      }
      const results = await Promise.allSettled(
        resources.map(async (resource) => {
          const resourceStartedAt = getSpotliHighResolutionNow();
          const wasCached =
            getWarmResource(
              resource.url,
              "arraybuffer",
              resource.rangeStart ?? null,
              resource.rangeEnd ?? null,
            ) != null;
          const data =
            partialBytes > 0
              ? await warmCachedResourcePrefix(
                  resource,
                  signal,
                  resource.kind === "init-map" ? initBytes : partialBytes,
                )
              : await warmCachedResource(resource, signal);
          logWarmResource(
            resource.kind || "first-media-resource",
            resource.url,
            "arraybuffer",
            resourceStartedAt,
            {
              loadedBytes: data?.byteLength || 0,
              partialPrefixWarmed: partialBytes > 0 ? data === true : undefined,
              requestedPrefixBytes:
                partialBytes > 0
                  ? resource.kind === "init-map"
                    ? initBytes
                    : partialBytes
                  : undefined,
              memoryCacheHit: wasCached,
              rangeStart: resource.rangeStart ?? null,
              rangeEnd: resource.rangeEnd ?? null,
              cacheState: wasCached ? "memory-cache" : "fetch-or-shared-fetch",
              selectedResolution: `${startupVariant.width || "?"}x${startupVariant.rawHeight || startupVariant.height || "?"}`,
              qualityTierHeight: startupVariant.height || null,
              advertisedBandwidthKbps: startupVariant.bandwidth
                ? Math.round(startupVariant.bandwidth / 1000)
                : null,
              byteRange: Number.isInteger(resource.rangeStart)
                ? `${resource.rangeStart}-${resource.rangeEnd - 1}`
                : null,
            },
          );
          return data;
        }),
      );
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("Could not warm the initial HLS media resource");
      }
      if (
        partialBytes > 0 &&
        !results.some(
          (result, index) =>
            resources[index]?.kind === "first-media-segment" &&
            result.status === "fulfilled" &&
            result.value === true,
        )
      ) {
        throw new Error(
          "The CDN did not provide a reusable partial media segment",
        );
      }
    }
    // On success, preserve this prewarm when the active HLS player takes over.
    hlsManifestPreloadCompleted.add(cacheKey);
    return true;
  })()
    .catch((error) => {
      if (!signal?.aborted) {
        console.warn("[Spotli playback] Cloudinary HLS prewarm failed", {
          source: hlsUrl,
          reason: error?.message || String(error || "unknown error"),
        });
      }
      // Prefetch must never block playback; the active player starts HLS on its
      // own and uses optimized progressive MP4 only if HLS is unavailable/fails.
      // Do not let an older aborted task delete a newer request for the same URL.
      hlsManifestPreloadCompleted.delete(cacheKey);
      if (
        !controller?.signal.aborted &&
        hlsManifestPreloadControllers.get(cacheKey) === controller
      ) {
        hlsManifestPreloads.delete(cacheKey);
      }
      return false;
    })
    .finally(() => {
      if (
        controller &&
        hlsManifestPreloadControllers.get(cacheKey) === controller
      ) {
        hlsManifestPreloadControllers.delete(cacheKey);
        hlsManifestPreloadStartedAt.delete(cacheKey);
      }
    });

  hlsManifestPreloads.set(cacheKey, request);

  while (hlsManifestPreloads.size > HLS_PREFETCH_CACHE_LIMIT) {
    const oldestKey = hlsManifestPreloads.keys().next().value;
    if (!oldestKey || oldestKey === cacheKey) break;
    hlsManifestPreloadControllers.get(oldestKey)?.abort();
    hlsManifestPreloadControllers.delete(oldestKey);
    hlsManifestPreloadCompleted.delete(oldestKey);
    hlsManifestPreloadStartedAt.delete(oldestKey);
    hlsManifestPreloads.delete(oldestKey);
  }

  return request;
}

// All Auto feed videos start from their persistent per-post progressive MP4
// element. A detached HLS tap warmup would prefetch a different source and can
// compete with the active video, so the viewer owns the request on every device.
export function prewarmCloudinaryVideoForOpen(value) {
  const networkProfile = getNetworkPlaybackProfile();
  console.info(
    "[Spotli playback] Skipping detached HLS tap prewarm; per-post MP4 element owns startup",
    {
      asset:
        getSpotliCloudinaryAssetParts(value)?.assetPathWithoutExtension || null,
      desktopPlayback: networkProfile.desktopPlayback,
      downlinkMbps: networkProfile.downlinkMbps,
      effectiveType: networkProfile.effectiveType,
      dataSaver: networkProfile.dataSaver,
    },
  );
  return Promise.resolve(false);
}

// Treat completed and in-flight HLS segment/chunk prewarms as reusable. The
// active hls.js loader below shares their exact resource promises.
function hasPrewarmedCloudinaryHlsChunk(value) {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return false;
  const chunkPrefix = `${hlsUrl}::auto::chunk-`;
  return (
    [...hlsManifestPreloadCompleted].some((key) =>
      key.startsWith(chunkPrefix),
    ) ||
    [...hlsManifestPreloads.keys()].some((key) => key.startsWith(chunkPrefix))
  );
}

function hasPrewarmedCloudinaryHlsFirstSegment(value) {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return false;
  const segmentKey = `${hlsUrl}::auto::segment`;
  return (
    hlsManifestPreloadCompleted.has(segmentKey) ||
    hlsManifestPreloads.has(segmentKey) ||
    hasPrewarmedCloudinaryHlsChunk(value)
  );
}

function hasPrewarmedCloudinaryHls(value) {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return false;
  const prefix = `${hlsUrl}::auto::`;
  return (
    hlsManifestPreloadCompleted.has(`${hlsUrl}::auto::playlist`) ||
    hlsManifestPreloadCompleted.has(`${hlsUrl}::auto::segment`) ||
    hlsManifestPreloads.has(`${hlsUrl}::auto::playlist`) ||
    hlsManifestPreloads.has(`${hlsUrl}::auto::segment`) ||
    [...hlsManifestPreloadCompleted].some((key) =>
      key.startsWith(`${prefix}chunk-`),
    ) ||
    [...hlsManifestPreloads.keys()].some((key) =>
      key.startsWith(`${prefix}chunk-`),
    )
  );
}

function getPrewarmedHlsFirstSegmentState(value) {
  const hlsUrl = getCloudinaryHlsUrl(value);
  if (!hlsUrl) return "unavailable";
  const key = `${hlsUrl}::auto::segment`;
  if (hlsManifestPreloadCompleted.has(key)) return "ready";
  if (hlsManifestPreloads.has(key)) return "loading";
  const chunkPrefix = `${hlsUrl}::auto::chunk-`;
  if (
    [...hlsManifestPreloadCompleted].some((entry) =>
      entry.startsWith(chunkPrefix),
    )
  )
    return "partial-ready";
  if (
    [...hlsManifestPreloads.keys()].some((entry) =>
      entry.startsWith(chunkPrefix),
    )
  )
    return "partial-loading";
  return "not-started";
}

let hlsLibraryPromise = null;

function browserCanUseHlsJs() {
  if (typeof window === "undefined") return false;
  // hls.js uses MediaSource or ManagedMediaSource. Native-HLS-only browsers
  // should not wait for, or download, the JavaScript HLS engine.
  return (
    typeof window.MediaSource !== "undefined" ||
    typeof window.ManagedMediaSource !== "undefined"
  );
}

function loadHlsLibrary() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (hlsLibraryPromise) return hlsLibraryPromise;

  // Bundle hls.js with the app and request its split chunk while the Home feed
  // is loading. This removes the extra third-party CDN round trip from the
  // tap-to-play path on slower mobile/tablet connections.
  hlsLibraryPromise = import("hls.js")
    .then((module) => module.default || module)
    .catch(() => {
      hlsLibraryPromise = null;
      return null;
    });

  return hlsLibraryPromise;
}

// Open the Cloudinary connection before a creator opens a video.
if (typeof document !== "undefined") {
  const origin = "https://res.cloudinary.com";
  const alreadyLinked = [
    ...document.querySelectorAll('link[rel="preconnect"]'),
  ].some((link) => link.href === origin || link.href === `${origin}/`);
  if (!alreadyLinked) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

// Auto playback starts from the persistent progressive MP4 element on every
// device. Defer hls.js until the MP4 recovery path actually needs HLS.
if (browserCanUseHlsJs() && !shouldSkipHlsPrewarmForMobileAuto()) {
  loadHlsLibrary();
}

function attachCloudinaryAdaptiveStream(
  video,
  originalUrl,
  fallbackUrl,
  shouldPlay,
  onAutoplayNeedsMute,
  onQualityOptionsChange,
  onQualityControllerChange,
  initialQuality = "auto",
  resumeTime = 0,
  onRememberPosition = null,
  onQualityNotice = null,
) {
  if (!video || !originalUrl || !fallbackUrl) return () => {};

  const hlsUrl = getCloudinaryHlsUrl(originalUrl);
  if (!hlsUrl) return () => {};

  const directMp4Url = getDirectSpotliMp4Url(originalUrl);
  const attachNetworkProfile = getNetworkPlaybackProfile();
  const playbackAttachStartedAt = Date.now();
  const playbackAttachPerformanceStartedAt = getSpotliHighResolutionNow();
  const playbackDiagnosticId = `spotli-${++nextSpotliPlaybackDiagnosticId}`;
  const getPlaybackElapsedMs = () =>
    Math.round(
      getSpotliHighResolutionNow() - playbackAttachPerformanceStartedAt,
    );
  const sourceParts = getSpotliCloudinaryAssetParts(originalUrl);
  const hasLocalUploadCopy =
    typeof fallbackUrl === "string" && fallbackUrl.startsWith("blob:");
  const initialQualityKey =
    initialQuality === "auto" || initialQuality == null
      ? "auto"
      : String(
          Number.parseInt(String(initialQuality).replace(/[^0-9]/g, ""), 10),
        );

  const retainedDesktopController = retainedDesktopHlsControllers.get(video);
  const retainedDesktopProfileKey = [
    attachNetworkProfile.startupHeight,
    attachNetworkProfile.dataSaver ? "data-saver" : "normal-data",
    attachNetworkProfile.weakNetwork ? "weak" : "normal-network",
    attachNetworkProfile.fastDesktop ? "fast-desktop" : "standard-desktop",
  ].join(":");
  if (retainedDesktopController) {
    if (
      initialQualityKey === "auto" &&
      retainedDesktopController.sourceUrl === originalUrl &&
      retainedDesktopController.profileKey === retainedDesktopProfileKey
    ) {
      retainedDesktopHlsControllers.delete(video);
      retainedDesktopController.activate(resumeTime, shouldPlay());
      console.info(
        "[Spotli playback] Reusing retained desktop HLS player and buffer",
        {
          asset: getSpotliCloudinaryAssetParts(originalUrl)?.assetPath || null,
          currentTimeSeconds:
            Math.round((Number(video.currentTime) || 0) * 100) / 100,
          readyState: video.readyState,
          bufferedAheadSeconds:
            Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        },
      );
      return () => retainedDesktopController.deactivate();
    }
    retainedDesktopHlsControllers.delete(video);
    retainedDesktopController.destroy?.();
  }

  const startupPreloadPolicy =
    getUpcomingVideoChunkPreloadPolicy(attachNetworkProfile);

  // Auto playback on every form factor starts from the same per-post
  // progressive MP4 element. HLS remains available as a recovery path if the
  // eager MP4 cannot be delivered, but it is no longer the normal desktop
  // startup sequence.
  const mobileProgressiveAutoPrimary = Boolean(
    initialQualityKey === "auto" &&
    !attachNetworkProfile.desktopPlayback &&
    !hasLocalUploadCopy,
  );
  const desktopProgressiveAutoPrimary = Boolean(
    initialQualityKey === "auto" &&
    attachNetworkProfile.desktopPlayback &&
    !hasLocalUploadCopy,
  );
  const progressiveAutoPrimary = Boolean(
    mobileProgressiveAutoPrimary || desktopProgressiveAutoPrimary,
  );
  // Keep the actual per-post MP4 element, decoded frame and buffer attached
  // whenever Auto playback is active. This makes desktop behave like the
  // already-working mobile/tablet resume path without changing their profile.
  const retainProgressiveBufferOnDeactivate = initialQualityKey === "auto";

  if (
    !hasLocalUploadCopy &&
    !progressiveAutoPrimary &&
    initialQualityKey === "auto" &&
    browserCanUseHlsJs()
  ) {
    preloadCloudinaryVideoStream(originalUrl, "auto", {
      partialBytes: startupPreloadPolicy.segmentBytes,
      initBytes: startupPreloadPolicy.initBytes,
    });
  }

  const hasWarmHlsStartup =
    !hasLocalUploadCopy &&
    (hasPrewarmedCloudinaryHlsChunk(originalUrl) ||
      hasPrewarmedCloudinaryHlsFirstSegment(originalUrl) ||
      hasPrewarmedCloudinaryHls(originalUrl));
  const usePrewarmedHlsAtStartup = Boolean(hasWarmHlsStartup);
  const hlsJsSupported = browserCanUseHlsJs();
  const nativeHlsSupportedAtPlan = Boolean(
    video.canPlayType("application/vnd.apple.mpegurl"),
  );
  const nativeLowDataMp4Plan = Boolean(
    !hlsJsSupported &&
    nativeHlsSupportedAtPlan &&
    (attachNetworkProfile.dataSaver || attachNetworkProfile.weakNetwork) &&
    !hasLocalUploadCopy,
  );
  const plannedPlaybackSource = hasLocalUploadCopy
    ? "local-upload-mp4"
    : desktopProgressiveAutoPrimary
      ? attachNetworkProfile.fastDesktop
        ? "optimized-progressive-mp4-desktop-1080-auto-primary"
        : "optimized-progressive-mp4-desktop-720-auto-primary"
      : mobileProgressiveAutoPrimary
        ? "optimized-progressive-mp4-mobile-auto-primary"
        : nativeLowDataMp4Plan
          ? "optimized-progressive-mp4-native-hls-low-data"
          : hlsJsSupported
            ? usePrewarmedHlsAtStartup
              ? "prewarmed-cloudinary-hls"
              : "cloudinary-hls"
            : nativeHlsSupportedAtPlan
              ? "native-cloudinary-hls"
              : "optimized-progressive-mp4-fallback";

  console.info("[Spotli playback] Playback source plan", {
    playbackId: playbackDiagnosticId,
    sourceAsset: sourceParts?.assetPath || null,
    originalSourceFormat: sourceParts?.sourceFormat || "unknown",
    plannedPlaybackSource,
    startupQuality: initialQualityKey,
    desktopPlayback: attachNetworkProfile.desktopPlayback,
    autoStartupHeight: attachNetworkProfile.startupHeight,
    weakNetwork: attachNetworkProfile.weakNetwork,
    dataSaver: attachNetworkProfile.dataSaver,
    downlinkMbps: attachNetworkProfile.downlinkMbps,
    hasPrewarmedHlsStartup: usePrewarmedHlsAtStartup,
    mobileProgressiveAutoPrimary,
    desktopProgressiveAutoPrimary,
    progressiveAutoPrimary,
    warmHlsFirstSegmentState: getPrewarmedHlsFirstSegmentState(originalUrl),
    progressiveMp4IsPrimary: progressiveAutoPrimary,
    progressiveMp4IsFallbackOnly:
      !progressiveAutoPrimary && !hasLocalUploadCopy,
    videoReadyStateAtAttach: video.readyState,
    videoNetworkStateAtAttach: video.networkState,
    videoBufferedAheadAtAttachSeconds:
      Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
    videoSourceAlreadyAttachedAtAttach: Boolean(
      video.currentSrc || video.getAttribute?.("src") || video.src,
    ),
  });
  // Preserve the active video's in-flight HLS manifest/segment warm request;
  // cancel only speculative work for other posts so they cannot compete.
  // Keep this video's pending HLS warm request whenever it will be used by
  // desktop playback. Previously constrained desktop starts ignored the
  // full-segment prewarm (they checked only partial chunks), then aborted that
  // request here and fetched the same segment again through the active player.
  const preserveActiveHlsWarmup =
    !progressiveAutoPrimary && usePrewarmedHlsAtStartup;
  cancelCloudinaryVideoPreloadsExcept(
    preserveActiveHlsWarmup || !directMp4Url ? hlsUrl : "",
  );

  let cancelled = false;
  let streamInactive = false;
  let hls = null;
  let firstMainFragmentKey = "";
  let firstMainFragmentRequestedAt = 0;
  let firstMainFragmentLoadedAt = 0;
  let firstMainFragmentBuffered = false;
  const getHlsLevelDiagnostics = (levelIndex = hls?.currentLevel) => {
    const index = Number.isInteger(levelIndex)
      ? levelIndex
      : Number(levelIndex);
    const level =
      Number.isInteger(index) && index >= 0 ? hls?.levels?.[index] : null;
    if (!level) return null;
    const width = Number(level.width) || 0;
    const height = Number(level.height) || 0;
    const bitrate = Number(level.bitrate) || 0;
    return {
      levelIndex: index,
      resolution: width && height ? `${width}x${height}` : null,
      qualityTierHeight:
        width && height ? Math.min(width, height) : height || null,
      bitrateKbps: bitrate ? Math.round(bitrate / 1000) : null,
      maxBitrateKbps: Number(level.maxBitrate)
        ? Math.round(Number(level.maxBitrate) / 1000)
        : null,
      codec: level.videoCodec || level.codecSet || null,
    };
  };
  const getFragmentDiagnostics = (frag) => ({
    type: frag?.type || null,
    levelIndex: Number.isInteger(frag?.level) ? frag.level : null,
    sequence: Number.isFinite(Number(frag?.sn))
      ? Number(frag.sn)
      : String(frag?.sn || ""),
    durationSeconds: Number.isFinite(Number(frag?.duration))
      ? Math.round(Number(frag.duration) * 1000) / 1000
      : null,
    url: frag?.url || null,
  });
  let networkRetries = 0;
  let mediaRetries = 0;
  // Startup retries are separate from post-start recovery. Desktop HLS has a
  // 720p+ floor and must tolerate transient Cloudinary/CDN startup failures
  // before abandoning its adaptive stream. Mobile/tablet never use this path.
  let desktopStartupRetryCount = 0;
  let desktopProgressiveFallbackRetryCount = 0;
  let directMp4Failed = false;
  let directMp4ErrorHandler = null;
  const startupRetryTimers = new Set();
  let manualRecoveryAttempts = 0;
  let selectedStreamQuality =
    initialQualityKey === "NaN" ? "auto" : initialQualityKey;
  let streamHasPlayed = false;
  let streamLoadStarted = false;
  let firstMediaDataReadyAt = 0;
  let autoAbrUnlocked = false;
  // Auto locks only the opening fragment to the prewarmed rendition, then
  // returns to ABR within the active profile cap. Manual quality stays locked.
  const savedResumeTime = Number.isFinite(Number(resumeTime))
    ? Math.max(0, Number(resumeTime))
    : 0;
  const normalizeMediaUrl = (value) => {
    const source = String(value || "");
    if (!source) return "";
    try {
      return new URL(source, document.baseURI).href;
    } catch {
      return source;
    }
  };
  const networkSelectedProgressiveSource = normalizeMediaUrl(fallbackUrl);
  const retainedMediaAtAttach = retainedProgressiveMedia.get(video);
  const currentAssetKey = sourceParts?.assetPathWithoutExtension || null;
  const retainedSourceMatchesAsset = Boolean(
    retainProgressiveBufferOnDeactivate &&
    retainedMediaAtAttach?.sourceUrl &&
    currentAssetKey &&
    retainedMediaAtAttach.assetKey === currentAssetKey,
  );
  // If the network estimate changes between leaving and returning to a post,
  // keep using the exact MP4 URL already attached to that card. Rebuilding a
  // different bitrate URL would throw away the decoded frame and its buffer.
  const expectedProgressiveSource = retainedSourceMatchesAsset
    ? retainedMediaAtAttach.sourceUrl
    : networkSelectedProgressiveSource;
  const retainedSourceMatches = Boolean(
    retainedMediaAtAttach?.sourceUrl &&
    expectedProgressiveSource &&
    retainedMediaAtAttach.sourceUrl === expectedProgressiveSource,
  );
  // The live element is the source of truth when it still has this video's
  // buffer. If the browser evicted/reset its media state, use the last saved
  // position captured at deactivation.
  const retainedElementTime = retainedSourceMatches
    ? Math.max(0, Number(retainedMediaAtAttach.currentTime) || 0)
    : 0;
  const liveElementHasExpectedSource = Boolean(
    expectedProgressiveSource &&
    normalizeMediaUrl(
      video.currentSrc || video.getAttribute?.("src") || video.src,
    ) === expectedProgressiveSource,
  );
  const liveElementTime = liveElementHasExpectedSource
    ? Math.max(0, Number(video.currentTime) || 0)
    : 0;
  const desiredResumeTime = Math.max(
    savedResumeTime,
    retainedElementTime,
    liveElementTime,
  );
  let resumePositionApplied = desiredResumeTime < 0.5;
  let resumeSeekPending = false;
  let resumePlayPending = false;
  let reusedRetainedBufferAtActivation = Boolean(
    retainedSourceMatches &&
    liveElementHasExpectedSource &&
    video.readyState >= 2 &&
    getSpotliBufferedAheadSeconds(video) > 0,
  );

  const rememberPosition = () => {
    const time = Number(video.currentTime);
    if (Number.isFinite(time) && time >= 0) onRememberPosition?.(time);
  };

  // Each post keeps its own playhead when the user scrolls away and comes back.
  // Restore the saved position once the same progressive source exposes
  // metadata/seekability; an evicted buffer may still require a range request.
  const restoreResumePosition = () => {
    if (
      cancelled ||
      streamInactive ||
      resumePositionApplied ||
      desiredResumeTime < 0.5
    ) {
      return resumePositionApplied;
    }
    if (video.readyState < 1) return false;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      if (desiredResumeTime >= video.duration - 0.35) {
        resumePositionApplied = true;
        resumeSeekPending = false;
        return true;
      }
    }

    try {
      const actualTime = Math.max(0, Number(video.currentTime) || 0);
      if (Math.abs(actualTime - desiredResumeTime) > 0.25) {
        // Do not let play() race ahead from 0 while the browser is seeking back
        // to the saved point. The seeked handler releases playback afterwards.
        if (!resumeSeekPending) {
          resumeSeekPending = true;
          video.currentTime = desiredResumeTime;
        }
        if (video.seeking) return false;
        const timeAfterSeek = Math.max(0, Number(video.currentTime) || 0);
        if (Math.abs(timeAfterSeek - desiredResumeTime) > 0.5) {
          // Some mobile browsers expose metadata before the requested time is
          // seekable. Allow later durationchange/canplay events to retry rather
          // than falsely marking the resume complete at 0 seconds.
          resumeSeekPending = false;
          return false;
        }
      }
      resumeSeekPending = false;
      resumePositionApplied = true;
      retainedProgressiveMedia.delete(video);
      onRememberPosition?.(desiredResumeTime);
      console.info("[Spotli playback] Resume position restored before play", {
        playbackId: playbackDiagnosticId,
        targetTimeSeconds: Math.round(desiredResumeTime * 100) / 100,
        actualTimeSeconds:
          Math.round((Number(video.currentTime) || 0) * 100) / 100,
        readyState: video.readyState,
        bufferedAheadSeconds:
          Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        sourceMatches: liveElementHasExpectedSource,
        retainedElementMatched: retainedSourceMatches,
      });
      return true;
    } catch {
      resumeSeekPending = false;
      // Retry on loadedmetadata/seeked/canplay if this source is not seekable yet.
      return false;
    }
  };

  let firstMediaLoadStartAt = 0;
  let lastMediaProgressLogAt = 0;
  let lastMediaProgressBufferSeconds = 0;
  const logMediaNetworkState = (eventType, { force = false } = {}) => {
    if (cancelled || streamInactive) return;
    const now = getSpotliHighResolutionNow();
    const nowBuffer = getSpotliBufferedAheadSeconds(video);
    if (
      !force &&
      eventType === "progress" &&
      now - lastMediaProgressLogAt < 900
    ) {
      return;
    }
    if (eventType === "progress") lastMediaProgressLogAt = now;
    const currentSource = String(video.currentSrc || video.src || "");
    const resourceTiming = getSpotliResourceTiming(currentSource);
    console.info(`[Spotli playback] Media network ${eventType}`, {
      playbackId: playbackDiagnosticId,
      elapsedMs: getPlaybackElapsedMs(),
      sinceMediaLoadStartMs: firstMediaLoadStartAt
        ? Math.round(now - firstMediaLoadStartAt)
        : null,
      currentTimeSeconds:
        Math.round((Number(video.currentTime) || 0) * 100) / 100,
      bufferedAheadSeconds: Math.round(nowBuffer * 100) / 100,
      bufferGrowthSincePreviousProgressSeconds:
        eventType === "progress"
          ? Math.round((nowBuffer - lastMediaProgressBufferSeconds) * 100) / 100
          : null,
      readyState: video.readyState,
      networkState: video.networkState,
      sourceMode: hls ? "hls" : "progressive-mp4",
      resourceTiming,
      ...getSpotliResourceTimingLogFields(resourceTiming),
    });
    if (eventType === "progress") lastMediaProgressBufferSeconds = nowBuffer;
  };
  const onMediaLoadStart = () => {
    if (!firstMediaLoadStartAt)
      firstMediaLoadStartAt = getSpotliHighResolutionNow();
    logMediaNetworkState("loadstart", { force: true });
  };
  const onMediaProgress = () => logMediaNetworkState("progress");
  const onMediaStalled = () => logMediaNetworkState("stalled", { force: true });
  const onMediaSuspend = () => logMediaNetworkState("suspend", { force: true });
  const onMediaLoadedMetadata = () => {
    if (attachNetworkProfile.desktopPlayback) {
      retainedDesktopInflightMp4Requests.delete(video);
    }
    logMediaNetworkState("loadedmetadata", { force: true });
  };

  video.addEventListener("loadstart", onMediaLoadStart);
  video.addEventListener("progress", onMediaProgress);
  video.addEventListener("stalled", onMediaStalled);
  video.addEventListener("suspend", onMediaSuspend);
  video.addEventListener("loadedmetadata", onMediaLoadedMetadata);

  const onVideoPlaying = () => {
    if (cancelled || streamInactive) return;
    if (directMp4ErrorHandler) {
      video.removeEventListener("error", directMp4ErrorHandler);
      directMp4ErrorHandler = null;
    }
    if (!streamHasPlayed) {
      const currentSrc = String(video.currentSrc || video.src || "");
      // hls.js attaches a MediaSource through a blob: URL. That is not the
      // recently uploaded local File/Blob cache; identify it as HLS explicitly.
      const isNativeHlsSource =
        /\.m3u8(?:[?#]|$)/i.test(currentSrc) || currentSrc === hlsUrl;
      const source = hls
        ? "cloudinary-hls-mse"
        : isNativeHlsSource
          ? "cloudinary-hls-native"
          : hasLocalUploadCopy
            ? "local-upload-cache"
            : currentSrc.startsWith("blob:")
              ? "blob-backed-media"
              : directMp4Failed
                ? "cloudinary-mp4-fallback"
                : "cloudinary-mp4";
      const decodedWidth = Number(video.videoWidth) || 0;
      const decodedHeight = Number(video.videoHeight) || 0;
      const firstFrameResourceTiming = getSpotliResourceTiming(currentSrc);
      console.info("[Spotli playback] First frame playing", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        legacyElapsedMs: Date.now() - playbackAttachStartedAt,
        source,
        plannedPlaybackSource,
        mobileProgressiveAutoPrimary,
        desktopProgressiveAutoPrimary,
        desktopPlayback: attachNetworkProfile.desktopPlayback,
        startupTargetHeight: attachNetworkProfile.startupHeight,
        selectedQuality: selectedStreamQuality,
        decodedResolution:
          decodedWidth && decodedHeight
            ? `${decodedWidth}x${decodedHeight}`
            : null,
        decodedQualityTierHeight:
          decodedWidth && decodedHeight
            ? Math.min(decodedWidth, decodedHeight)
            : null,
        activeRendition: getHlsLevelDiagnostics(),
        resumeTargetSeconds: Math.round(desiredResumeTime * 100) / 100,
        resumePositionApplied,
        resumedFromRetainedElement: reusedRetainedBufferAtActivation,
        bufferedAheadSeconds:
          Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        readyState: video.readyState,
        networkState: video.networkState,
        mediaDataToPlayingMs: firstMediaDataReadyAt
          ? Math.max(
              0,
              Math.round(getSpotliHighResolutionNow() - firstMediaDataReadyAt),
            )
          : null,
        resourceTiming: firstFrameResourceTiming,
        ...getSpotliResourceTimingLogFields(firstFrameResourceTiming),
      });
    }
    streamHasPlayed = true;
    rememberPosition();
  };
  const onVideoWaiting = () => {
    if (cancelled || streamInactive) return;
    console.warn("[Spotli playback] Video waiting for media data", {
      playbackId: playbackDiagnosticId,
      elapsedMs: getPlaybackElapsedMs(),
      afterFirstFrame: streamHasPlayed,
      currentTimeSeconds:
        Math.round((Number(video.currentTime) || 0) * 100) / 100,
      bufferedAheadSeconds:
        Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
      readyState: video.readyState,
      networkState: video.networkState,
      activeRendition: getHlsLevelDiagnostics(),
      sourceMode: hls ? "hls" : "progressive-mp4",
    });
  };
  video.addEventListener("playing", onVideoPlaying);
  video.addEventListener("waiting", onVideoWaiting);
  video.addEventListener("timeupdate", rememberPosition);

  const playIfRequested = () => {
    if (cancelled || streamInactive || !shouldPlay()) return;
    if (!restoreResumePosition()) {
      resumePlayPending = true;
      return;
    }
    resumePlayPending = false;

    // Keep autoplay inline and set the DOM property too: the HLS source is
    // attached after React renders, so the initial autoPlay attribute alone
    // cannot start playback.
    video.autoplay = true;
    video.playsInline = true;

    let playPromise;
    try {
      playPromise = video.play();
    } catch {
      return;
    }

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((error) => {
        if (cancelled || streamInactive || !shouldPlay()) return;

        // Browsers may reject autoplay when the saved sound preference is on.
        // Retry silently and sync the viewer's mute control to the real state.
        if (error?.name === "NotAllowedError" && !video.muted) {
          video.muted = true;
          onAutoplayNeedsMute?.();
          video.play().catch(() => {});
        }
      });
    }
  };

  const onMediaReady = (event) => {
    if (!firstMediaDataReadyAt && video.readyState >= 2) {
      firstMediaDataReadyAt = getSpotliHighResolutionNow();
      const activeSourceUrl = String(video.currentSrc || video.src || "");
      const firstDecodedResourceTiming =
        getSpotliResourceTiming(activeSourceUrl);
      console.info("[Spotli playback] First decoded media data ready", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        eventType: event?.type || null,
        readyState: video.readyState,
        sourceMode: hls ? "hls" : "progressive-mp4",
        sourceUrl: activeSourceUrl || null,
        resourceTiming: firstDecodedResourceTiming,
        ...getSpotliResourceTimingLogFields(firstDecodedResourceTiming),
      });
    }
    playIfRequested();
  };
  const onResumeSeeked = () => {
    restoreResumePosition();
    if (resumePlayPending) playIfRequested();
  };

  video.addEventListener("loadedmetadata", restoreResumePosition);
  video.addEventListener("durationchange", restoreResumePosition);
  video.addEventListener("seeked", onResumeSeeked);
  video.addEventListener("loadeddata", onMediaReady);
  video.addEventListener("canplay", onMediaReady);
  // A retained element may already be ready when its post becomes active again;
  // media events have already fired in that case, so restore synchronously.
  if (video.readyState >= 1) restoreResumePosition();

  const installDirectMp4FallbackHandler = ({
    allowHlsFallback = false,
  } = {}) => {
    if ((!directMp4Url && !allowHlsFallback) || directMp4ErrorHandler) return;
    directMp4ErrorHandler = () => {
      if (cancelled || streamInactive || directMp4Failed) return;

      const mediaErrorCode = Number(video.error?.code) || 0;
      const isDesktopCloudinaryProgressiveSource = Boolean(
        attachNetworkProfile.desktopPlayback &&
        !hasLocalUploadCopy &&
        !String(expectedProgressiveSource || fallbackUrl || "").startsWith(
          "blob:",
        ),
      );
      const canRetryTransientDesktopFailure =
        isDesktopCloudinaryProgressiveSource &&
        (mediaErrorCode === 0 ||
          mediaErrorCode === 2 ||
          mediaErrorCode === 4) &&
        desktopProgressiveFallbackRetryCount < 2;

      if (directMp4ErrorHandler) {
        video.removeEventListener("error", directMp4ErrorHandler);
        directMp4ErrorHandler = null;
      }

      if (canRetryTransientDesktopFailure) {
        desktopProgressiveFallbackRetryCount += 1;
        const attempt = desktopProgressiveFallbackRetryCount;
        const retryDelayMs = attempt === 1 ? 650 : 1_400;
        const retryTimer = setTimeout(() => {
          startupRetryTimers.delete(retryTimer);
          if (cancelled || streamInactive || directMp4Failed) return;

          const retryUrl = expectedProgressiveSource || fallbackUrl;
          if (!retryUrl) {
            directMp4Failed = true;
            return;
          }

          // The first fallback request can race Cloudinary eager processing or
          // encounter a transient CDN/network error. Retry the same eager URL;
          // never create a new, higher-bitrate on-demand transformation.
          installDirectMp4FallbackHandler({ allowHlsFallback: true });
          video.preload = "auto";
          video.setAttribute("preload", "auto");
          video.src = retryUrl;
          video.load();
          playIfRequested();

          console.warn(
            "[Spotli playback] Retrying desktop eager MP4 startup after a transient media error",
            {
              playbackId: playbackDiagnosticId,
              attempt,
              maxAttempts: 2,
              retryDelayMs,
              mediaErrorCode: mediaErrorCode || null,
              fallbackBitrate: attachNetworkProfile.desktopPlayback
                ? getDesktopProgressiveBitrate(attachNetworkProfile)
                : attachNetworkProfile.progressiveFallbackBitrate || "800k",
              fallbackDimension: attachNetworkProfile.fastDesktop ? 1920 : 1280,
            },
          );
        }, retryDelayMs);
        startupRetryTimers.add(retryTimer);
        return;
      }

      directMp4Failed = true;
      console.warn(
        "[Spotli playback] Optimized progressive MP4 startup failed; switching to Cloudinary HLS recovery",
        {
          playbackId: playbackDiagnosticId,
          mediaErrorCode: mediaErrorCode || null,
          desktopFallbackRetries: desktopProgressiveFallbackRetryCount,
        },
      );
      start(true).catch((error) => {
        if (cancelled || streamInactive) return;
        console.error(
          "[Spotli playback] HLS fallback initialization failed",
          error,
        );
        onQualityNotice?.(
          "This video is temporarily unavailable. Please try again shortly.",
        );
      });
    };
    video.addEventListener("error", directMp4ErrorHandler);
  };

  const useProgressiveFallback = () => {
    if (cancelled || streamInactive) return;
    if (directMp4Failed) {
      // Never cycle back to an MP4 URL the browser has already reported as
      // unavailable. Keep/restore HLS instead of repeatedly restarting a 404.
      return;
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
    cancelCloudinaryVideoPreload(originalUrl, "auto");
    installDirectMp4FallbackHandler({ allowHlsFallback: true });
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);

    // Reactivate the exact media element in active mode before calling play().
    // A retained card may have been demoted to preload="metadata" while offscreen.
    video.preload = "auto";
    video.setAttribute("preload", "auto");
    video.autoplay = true;
    video.playsInline = true;
    if (attachNetworkProfile.desktopPlayback) {
      retainedDesktopInflightMp4Requests.delete(video);
    }

    let targetUrl = String(expectedProgressiveSource || fallbackUrl || "");
    if (attachNetworkProfile.desktopPlayback && !hasLocalUploadCopy) {
      console.info(
        "[Spotli playback] Desktop Auto startup uses upload-time eager MP4 derivative",
        {
          playbackId: playbackDiagnosticId,
          bitrate: getDesktopProgressiveBitrate(attachNetworkProfile),
          maxDimension: attachNetworkProfile.fastDesktop ? 1920 : 1280,
          quality: "auto:eco",
          sourceAsset: sourceParts?.assetPath || null,
        },
      );
    }
    let currentSrc = String(video.currentSrc || video.src || "");
    try {
      if (targetUrl) targetUrl = new URL(targetUrl, document.baseURI).href;
      if (currentSrc) currentSrc = new URL(currentSrc, document.baseURI).href;
    } catch {
      // Keep the original strings when URL normalization is unavailable.
    }
    if (
      currentSrc !== targetUrl ||
      video.error ||
      (video.readyState === 0 && video.networkState !== 2)
    ) {
      video.src = expectedProgressiveSource || fallbackUrl;
      video.load();
    } else if (video.readyState > 0 || video.networkState === 2) {
      const retainedRecord = retainedProgressiveMedia.get(video);
      const retainedBufferMatches = Boolean(
        retainProgressiveBufferOnDeactivate &&
        (retainedRecord?.sourceUrl === targetUrl || retainedSourceMatches) &&
        video.readyState >= 2 &&
        !video.error &&
        getSpotliBufferedAheadSeconds(video) > 0,
      );
      reusedRetainedBufferAtActivation = retainedBufferMatches;
      console.info(
        retainedBufferMatches
          ? attachNetworkProfile.desktopPlayback
            ? "[Spotli playback] Reusing retained desktop MP4 buffer"
            : "[Spotli playback] Reusing retained mobile MP4 buffer"
          : attachNetworkProfile.desktopPlayback
            ? "[Spotli playback] Reusing attached desktop progressive MP4 source"
            : "[Spotli playback] Reusing attached progressive MP4 source",
        {
          readyState: video.readyState,
          networkState: video.networkState,
          currentTimeSeconds:
            Math.round((Number(video.currentTime) || 0) * 100) / 100,
          resumeTargetSeconds: Math.round(desiredResumeTime * 100) / 100,
          bufferedAheadSeconds:
            Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
          retainedBufferMatches,
          retainedAtSeconds: retainedRecord
            ? Math.round((Number(retainedRecord.currentTime) || 0) * 100) / 100
            : null,
        },
      );
    }
    playIfRequested();
  };

  const onNativeHlsError = () => {
    if (!directMp4Failed) {
      useProgressiveFallback();
      return;
    }
    if (networkRetries < 2) {
      networkRetries += 1;
      const timerId = setTimeout(() => {
        startupRetryTimers.delete(timerId);
        if (!cancelled && !streamInactive) startNativeHls();
      }, 350 * networkRetries);
      startupRetryTimers.add(timerId);
      return;
    }
    console.error("[Spotli playback] MP4 and native HLS both failed", {
      source: hlsUrl,
      mediaErrorCode: video.error?.code || null,
    });
    onQualityNotice?.(
      "This video is temporarily unavailable. Please try again shortly.",
    );
  };

  const startNativeHls = () => {
    if (cancelled || streamInactive) return;
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);

    // Native HLS players (notably older iOS Safari) don't expose a reliable way
    // for this app to cap the rendition. On Data Saver or a weak connection,
    // use the matching low-bitrate progressive MP4 rather than risk a large
    // native-HLS rendition. Normal connections retain native HLS adaptation.
    const nativePlaybackProfile = getNetworkPlaybackProfile();
    if (
      (nativePlaybackProfile.dataSaver || nativePlaybackProfile.weakNetwork) &&
      !hasLocalUploadCopy &&
      !directMp4Failed
    ) {
      installDirectMp4FallbackHandler();
      video.preload = "auto";
      video.src = fallbackUrl;
      video.load();
      playIfRequested();
      console.info(
        "[Spotli playback] Native low-data playback uses optimized progressive MP4",
        {
          playbackId: playbackDiagnosticId,
        },
      );
      return;
    }

    video.preload = "auto";
    video.addEventListener("error", onNativeHlsError, { once: true });
    video.src = hlsUrl;
    video.load();
    playIfRequested();
  };

  const start = async (forceHls = false) => {
    const startupNetworkProfile = getNetworkPlaybackProfile();
    const nativeHlsSupported = Boolean(
      video.canPlayType("application/vnd.apple.mpegurl"),
    );

    // A just-published local Blob is still the fastest path. Auto playback on
    // mobile, tablet and desktop starts from the retained progressive MP4 feed
    // element; HLS is loaded only if the MP4 recovery handler needs it.
    if (hasLocalUploadCopy && !forceHls) {
      console.info(
        "[Spotli playback] Starting just-uploaded local MP4; skipping CDN startup",
        { playbackId: playbackDiagnosticId },
      );
      useProgressiveFallback();
      return;
    }

    if (!forceHls && progressiveAutoPrimary && !directMp4Failed) {
      const desktopFast = Boolean(
        startupNetworkProfile.desktopPlayback &&
        startupNetworkProfile.fastDesktop,
      );
      console.info(
        startupNetworkProfile.desktopPlayback
          ? "[Spotli playback] Desktop Auto starting eagerly generated progressive MP4 on the persistent feed element"
          : "[Spotli playback] Mobile Auto using retained progressive MP4 for instant return-to-video resume",
        {
          playbackId: playbackDiagnosticId,
          targetHeight: startupNetworkProfile.desktopPlayback
            ? desktopFast
              ? 1080
              : 720
            : startupNetworkProfile.progressiveFallbackHeight,
          targetBitrate: startupNetworkProfile.desktopPlayback
            ? getDesktopProgressiveBitrate(startupNetworkProfile)
            : startupNetworkProfile.progressiveFallbackBitrate || "800k",
          maxDimension: startupNetworkProfile.desktopPlayback
            ? desktopFast
              ? 1920
              : 1280
            : startupNetworkProfile.progressiveFallbackMaxDimension || null,
          downlinkMbps: startupNetworkProfile.downlinkMbps,
          effectiveType: startupNetworkProfile.effectiveType,
          dataSaver: startupNetworkProfile.dataSaver,
          weakNetwork: startupNetworkProfile.weakNetwork,
          sourceRetention: true,
          hlsMode: "recovery-fallback-only",
        },
      );
      useProgressiveFallback();
      return;
    }

    if (usePrewarmedHlsAtStartup && !forceHls) {
      console.info(
        "[Spotli playback] Starting prewarmed Cloudinary HLS; sharing the prepared byte prefix",
        {
          playbackId: playbackDiagnosticId,
          qualityTarget: startupNetworkProfile.startupHeight,
          desktopMinimumHeight: startupNetworkProfile.desktopPlayback
            ? DESKTOP_AUTO_MIN_HEIGHT
            : null,
        },
      );
    } else {
      console.info(
        "[Spotli playback] Starting Cloudinary HLS without a completed prewarm",
        {
          playbackId: playbackDiagnosticId,
          qualityTarget: startupNetworkProfile.startupHeight,
          desktopMinimumHeight: startupNetworkProfile.desktopPlayback
            ? DESKTOP_AUTO_MIN_HEIGHT
            : null,
        },
      );
    }

    // iPhone/iPad Safari without MSE already has a native HLS decoder. Attach
    // its source immediately instead of waiting for hls.js to download and then
    // discovering that hls.js cannot run on this device.
    if (!browserCanUseHlsJs() && nativeHlsSupported) {
      startNativeHls();
      return;
    }

    // Never wait on a speculative preload before playback. A completed Home
    // prewarm can be reused via browser cache; if it is still incomplete, the
    // active HLS player starts its own requests immediately.

    // hls.js is requested from the app's own split bundle early during Home
    // startup, so this should usually already be resolved when the user taps.
    const hlsLibraryStartedAt = getSpotliHighResolutionNow();
    const Hls = await loadHlsLibrary();
    console.info("[Spotli playback] HLS engine ready", {
      playbackId: playbackDiagnosticId,
      elapsedMs: getPlaybackElapsedMs(),
      libraryWaitMs: Math.round(
        getSpotliHighResolutionNow() - hlsLibraryStartedAt,
      ),
      version: Hls?.version || null,
      supported: Boolean(Hls?.isSupported?.()),
    });
    if (cancelled || streamInactive) return;

    if (!Hls || !Hls.isSupported()) {
      // Native fallback remains available on Safari; it does not expose custom
      // quality levels, which is also true for the previous native fallback.
      if (nativeHlsSupported) {
        startNativeHls();
        return;
      }

      useProgressiveFallback();
      return;
    }

    const networkProfile = getNetworkPlaybackProfile();
    const connectionInformation =
      typeof navigator !== "undefined" ? navigator.connection : null;
    console.info("[Spotli playback] HLS startup network profile", {
      playbackId: playbackDiagnosticId,
      constrained: networkProfile.constrained,
      touchDevice: networkProfile.touchDevice,
      dataSaver: networkProfile.dataSaver,
      weakNetwork: networkProfile.weakNetwork,
      fastDesktop: networkProfile.fastDesktop,
      autoHeightCap: networkProfile.startupHeight,
      progressiveFallbackHeight: networkProfile.progressiveFallbackHeight,
      defaultBandwidthKbps: Math.round(
        networkProfile.defaultBandwidthEstimate / 1000,
      ),
      startupBandwidthBudgetKbps: Math.round(
        networkProfile.startupBandwidthBudget / 1000,
      ),
      effectiveType: connectionInformation?.effectiveType || null,
      downlinkMbps: Number(connectionInformation?.downlink) || null,
      rttMs: Number(connectionInformation?.rtt) || null,
    });
    const desktopHlsLoadPolicies = networkProfile.desktopPlayback
      ? {
          // hls.js 1.7.x load policies replace the older one-shot timeout
          // settings below. Give desktop 720p+ playlists and media fragments
          // reasonable first-byte/transfer windows and bounded transient retries.
          manifestLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 12_000,
              maxLoadTimeMs: 30_000,
              timeoutRetry: {
                maxNumRetry: 2,
                retryDelayMs: 500,
                maxRetryDelayMs: 2_000,
                backoff: "exponential",
              },
              errorRetry: {
                maxNumRetry: 2,
                retryDelayMs: 800,
                maxRetryDelayMs: 3_000,
                backoff: "exponential",
              },
            },
          },
          playlistLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 12_000,
              maxLoadTimeMs: 30_000,
              timeoutRetry: {
                maxNumRetry: 2,
                retryDelayMs: 500,
                maxRetryDelayMs: 2_000,
                backoff: "exponential",
              },
              errorRetry: {
                maxNumRetry: 3,
                retryDelayMs: 800,
                maxRetryDelayMs: 4_000,
                backoff: "exponential",
              },
            },
          },
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 15_000,
              maxLoadTimeMs: 60_000,
              timeoutRetry: {
                maxNumRetry: 3,
                retryDelayMs: 500,
                maxRetryDelayMs: 2_500,
                backoff: "exponential",
              },
              errorRetry: {
                maxNumRetry: 3,
                retryDelayMs: 1_000,
                maxRetryDelayMs: 5_000,
                backoff: "exponential",
              },
            },
          },
        }
      : {};

    hls = new Hls({
      ...desktopHlsLoadPolicies,
      loader: createWarmCacheLoader(Hls),
      enableWorker: true,
      startLevel: -1,
      // Be deliberately conservative before HLS has a reliable bandwidth
      // sample. This prevents a high first fragment from creating a long wait.
      // Respect the actual conservative estimate. Forcing a 900 kbps starting
      // estimate and a 550 kbps minimum made HLS choose 480p even on a ~0.59 Mbps
      // connection, producing a 1.4 MB segment that took 17.8 seconds to download.
      abrEwmaDefaultEstimate: networkProfile.defaultBandwidthEstimate,
      abrBandWidthFactor: networkProfile.dataSaver
        ? 0.78
        : networkProfile.constrained
          ? 0.84
          : 0.92,
      abrBandWidthUpFactor: networkProfile.dataSaver
        ? 0.68
        : networkProfile.constrained
          ? 0.76
          : 0.9,
      maxStarvationDelay: networkProfile.dataSaver
        ? 1.5
        : networkProfile.touchDevice
          ? 1.5
          : networkProfile.constrained
            ? 2
            : 3,
      maxLoadingDelay: networkProfile.dataSaver
        ? 2
        : networkProfile.touchDevice
          ? 2
          : networkProfile.constrained
            ? 3
            : 4,
      // The first segment is warmed/shared by Spotli's cache loader. Keep
      // hls.js start-fragment prefetch enabled so the initial media request is
      // issued as soon as the startup rendition is known.
      startFragPrefetch: true,
      // Wait until the manifest is parsed so the first level can be selected
      // deliberately. Auto starts from the same small rendition warmed by the
      // Home-card preloader, rather than guessing a high level on the click path.
      autoStartLoad: false,
      // Cloudinary serves the custom 1030p rendition when the source supports it.
      // Do not cap to the rendered element size, which can override a
      // viewer's explicit manual quality choice on smaller screens.
      capLevelToPlayerSize: false,
      // Keep the forward buffer deliberately small on mobile. This reduces
      // bytes downloaded for clips the viewer quickly scrolls past.
      maxBufferLength: networkProfile.dataSaver
        ? 2
        : networkProfile.touchDevice
          ? networkProfile.constrained
            ? 2.5
            : 3
          : networkProfile.constrained
            ? 6
            : 10,
      maxMaxBufferLength: networkProfile.dataSaver
        ? 2.5
        : networkProfile.touchDevice
          ? networkProfile.constrained
            ? 3.5
            : 4.5
          : networkProfile.constrained
            ? 12
            : 18,
      maxBufferSize: networkProfile.dataSaver
        ? 4 * 1024 * 1024
        : networkProfile.touchDevice
          ? (networkProfile.constrained ? 6 : 8) * 1024 * 1024
          : (networkProfile.constrained ? 24 : 40) * 1024 * 1024,
      backBufferLength:
        networkProfile.dataSaver || networkProfile.touchDevice ? 0 : 4,
      // Keep the previous mobile/tablet retry policy exactly as it was. Desktop
      // uses the modern LoadPolicy objects above plus these compatibility values
      // for loaders that still consult the deprecated fields.
      manifestLoadingTimeOut: networkProfile.desktopPlayback ? 12_000 : 2_000,
      manifestLoadingMaxRetry: networkProfile.desktopPlayback
        ? 2
        : networkProfile.dataSaver
          ? 0
          : 1,
      manifestLoadingRetryDelay: networkProfile.desktopPlayback ? 800 : 250,
      manifestLoadingMaxRetryTimeout: networkProfile.desktopPlayback
        ? 4_000
        : 500,
      levelLoadingTimeOut: networkProfile.desktopPlayback ? 15_000 : 2_500,
      levelLoadingMaxRetry: networkProfile.desktopPlayback
        ? 3
        : networkProfile.dataSaver
          ? 0
          : 1,
      levelLoadingRetryDelay: networkProfile.desktopPlayback ? 800 : 250,
      levelLoadingMaxRetryTimeout: networkProfile.desktopPlayback ? 5_000 : 500,
      fragLoadingTimeOut: networkProfile.desktopPlayback ? 30_000 : 7_000,
      fragLoadingMaxRetry: networkProfile.desktopPlayback ? 3 : 0,
    });

    const publishQualityOptions = () => {
      if (cancelled || streamInactive || !hls) return;
      const bestLevelByHeight = new Map();
      hls.levels.forEach((level, index) => {
        const height = getQualityTierHeight(level);
        const bitrate = Number(level.bitrate) || 0;
        if (!height) return;
        const existing = bestLevelByHeight.get(height);
        if (!existing || bitrate > existing.bitrate) {
          bestLevelByHeight.set(height, {
            height,
            bitrate,
            index,
            label: `${height}p`,
          });
        }
      });
      const options = [...bestLevelByHeight.values()].sort(
        (a, b) => a.height - b.height,
      );
      const atOrAboveFloor = options.filter(
        (option) => option.height >= MIN_AUTOMATIC_QUALITY_HEIGHT,
      );
      onQualityOptionsChange?.(atOrAboveFloor);
    };

    const getLevelForRequestedQuality = (requestedQuality) => {
      if (!hls?.levels?.length) return null;

      const available = hls.levels
        .map((level, index) => ({
          index,
          height: getQualityTierHeight(level),
          bitrate: Number(level.bitrate) || 0,
        }))
        .filter((level) => level.height > 0);

      if (!available.length) return null;

      if (requestedQuality === "auto" || requestedQuality == null) {
        // Keep the active player's opening rendition identical to the one
        // prepared by the Home prewarmer. ABR takes over after the first segment.
        return selectSpotliAutoStartupVariant(
          available.map((level) => ({
            ...level,
            bandwidth: level.bitrate,
          })),
          networkProfile,
        );
      }

      const requestedHeight = Number(requestedQuality);
      const exact = available
        .filter((level) => level.height === requestedHeight)
        .sort((a, b) => b.bitrate - a.bitrate);
      const below = available
        .filter((level) => level.height < requestedHeight)
        .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
      return (
        exact[0] ||
        below[0] ||
        available.sort(
          (a, b) => a.height - b.height || b.bitrate - a.bitrate,
        )[0]
      );
    };

    const getAutoLevelCapIndex = () => {
      if (!hls?.levels?.length) return -1;
      const eligible = hls.levels
        .map((level, index) => ({
          index,
          height: getQualityTierHeight(level),
          bitrate: Number(level.bitrate) || 0,
        }))
        .filter(
          (level) =>
            level.height > 0 &&
            level.height <= networkProfile.startupHeight &&
            (!networkProfile.desktopPlayback ||
              level.height >= DESKTOP_AUTO_MIN_HEIGHT),
        );

      if (eligible.length) {
        // Do not assume the manifest's rendition array is ordered by index.
        // Cap at the actual highest allowed resolution, with bitrate as a tie-break.
        return (
          [...eligible].sort(
            (a, b) =>
              b.height - a.height || b.bitrate - a.bitrate || b.index - a.index,
          )[0]?.index ?? -1
        );
      }

      // Some uploads may not have a rendition inside the requested range.
      // Prefer the best available source rendition rather than deliberately
      // falling back to 480p on desktop.
      const highest = hls.levels
        .map((level, index) => ({
          index,
          height: getQualityTierHeight(level),
          bitrate: Number(level.bitrate) || 0,
        }))
        .filter((level) => level.height > 0)
        .sort(
          (a, b) =>
            b.height - a.height || b.bitrate - a.bitrate || b.index - a.index,
        )[0];
      return Number.isInteger(highest?.index) ? highest.index : -1;
    };

    const applyDesktopAutoQualityFloor = () => {
      if (!hls || !networkProfile.desktopPlayback || !hls.levels?.length)
        return 0;

      const desktopFloorBitrates = hls.levels
        .filter(
          (level) => getQualityTierHeight(level) >= DESKTOP_AUTO_MIN_HEIGHT,
        )
        .map((level) => Number(level.maxBitrate) || Number(level.bitrate) || 0)
        .filter((bitrate) => bitrate > 0);

      if (!desktopFloorBitrates.length) return 0;

      // hls.js uses minAutoBitrate to compute minAutoLevel. Setting it from
      // the lowest 720p+ rendition prevents ABR from choosing 480p on desktop.
      const minimumBitrate = Math.min(...desktopFloorBitrates);
      if (hls.config) hls.config.minAutoBitrate = minimumBitrate;
      return minimumBitrate;
    };

    const applyAutoLevelCap = () => {
      if (!hls) return;
      if (selectedStreamQuality !== "auto") {
        hls.autoLevelCapping = -1;
        return;
      }
      applyDesktopAutoQualityFloor();
      hls.autoLevelCapping = getAutoLevelCapIndex();
    };

    onQualityControllerChange?.({
      isPoorNetworkForQuality: (requestedQuality) => {
        if (networkProfile.constrained) return true;
        const requestedHeight = Number(requestedQuality);
        const targetLevel = hls?.levels?.find(
          (level) => getQualityTierHeight(level) === requestedHeight,
        );
        const measuredBandwidth = Number(hls?.bandwidthEstimate) || 0;
        return Boolean(
          targetLevel &&
          measuredBandwidth > 0 &&
          Number(targetLevel.bitrate) > measuredBandwidth * 0.85,
        );
      },
      selectQuality: (requestedQuality) => {
        // Store the user's choice even before the manifest arrives. MANIFEST_PARSED
        // uses it to choose the initial rendition before any segment is requested.
        selectedStreamQuality =
          requestedQuality === "auto" || requestedQuality == null
            ? "auto"
            : String(requestedQuality);

        if (!hls) return;
        hls.capLevelToPlayerSize = false;
        applyAutoLevelCap();

        const target = getLevelForRequestedQuality(selectedStreamQuality);
        if (!target) return;

        if (selectedStreamQuality === "auto") {
          // Use the prewarmed rendition for startup. Once the first fragment is
          // buffered, -1 releases HLS.js back to Auto while the profile cap keeps
          // normal playback at 720p, low-data playback at 480p, and fast desktop
          // playback at up to 1080p.
          hls.startLevel = target.index;
          if (streamLoadStarted && autoAbrUnlocked) {
            hls.loadLevel = -1;
            hls.nextLevel = -1;
          } else {
            hls.loadLevel = target.index;
          }
          return;
        }

        if (!streamLoadStarted) {
          hls.startLevel = target.index;
          hls.loadLevel = target.index;
          return;
        }

        // A manual quality choice is a lock. Switch at the earliest safe
        // fragment boundary without flushing the already-buffered video.
        hls.startLevel = target.index;
        hls.loadLevel = target.index;

        if (video.paused) {
          if (hls.currentLevel !== target.index)
            hls.currentLevel = target.index;
        } else if (hls.nextLevel !== target.index) {
          hls.nextLevel = target.index;
        }
      },
    });

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      // Do not await a background preload here. The active player must request
      // the master playlist immediately; unfinished preloads were a multi-second
      // gate on poor Airtel connections.
      if (!cancelled && !streamInactive && hls) hls.loadSource(hlsUrl);
    });

    hls.on(Hls.Events.MANIFEST_LOADING, (_event, data) => {
      console.info("[Spotli playback] HLS master playlist requested", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        url: data?.url || hlsUrl,
      });
    });

    hls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => {
      const stats = data?.stats || {};
      const loading = stats.loading || {};
      console.info("[Spotli playback] HLS master playlist loaded", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        requestMs:
          Number(loading.end) > 0 && Number(loading.start) > 0
            ? Math.round(loading.end - loading.start)
            : null,
        firstByteMs:
          Number(loading.first) > 0 && Number(loading.start) > 0
            ? Math.round(loading.first - loading.start)
            : null,
        levelCount: Array.isArray(data?.levels) ? data.levels.length : 0,
        resourceTiming: getSpotliResourceTiming(data?.url || hlsUrl),
      });
    });

    hls.on(Hls.Events.LEVEL_LOADING, (_event, data) => {
      console.info("[Spotli playback] HLS rendition playlist requested", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        levelIndex: data?.level ?? null,
        requestedRendition: getHlsLevelDiagnostics(data?.level),
        url: data?.url || null,
      });
    });

    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
      const stats = data?.stats || {};
      const loading = stats.loading || {};
      const details = data?.details || {};
      console.info("[Spotli playback] HLS rendition playlist loaded", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        levelIndex: data?.level ?? null,
        rendition: getHlsLevelDiagnostics(data?.level),
        requestMs:
          Number(loading.end) > 0 && Number(loading.start) > 0
            ? Math.round(loading.end - loading.start)
            : null,
        firstByteMs:
          Number(loading.first) > 0 && Number(loading.start) > 0
            ? Math.round(loading.first - loading.start)
            : null,
        firstSegmentDurationSeconds:
          Number(details.fragments?.[0]?.duration) || null,
        totalPlaylistDurationSeconds: Number(details.totalduration) || null,
        fragmentCount: Array.isArray(details.fragments)
          ? details.fragments.length
          : null,
        resourceTiming: getSpotliResourceTiming(data?.url || ""),
      });
    });

    hls.on(Hls.Events.FRAG_LOADING, (_event, data) => {
      const frag = data?.frag;
      if (
        !firstMainFragmentRequestedAt &&
        frag &&
        (!frag.type || frag.type === "main") &&
        Number.isFinite(Number(frag.sn))
      ) {
        firstMainFragmentKey = `${frag.level}:${frag.sn}:${frag.url || ""}`;
        firstMainFragmentRequestedAt = getSpotliHighResolutionNow();
        console.info("[Spotli playback] First HLS media segment requested", {
          playbackId: playbackDiagnosticId,
          elapsedMs: getPlaybackElapsedMs(),
          fragment: getFragmentDiagnostics(frag),
          rendition: getHlsLevelDiagnostics(frag.level),
        });
      }
    });

    hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
      const frag = data?.frag;
      if (!frag || !firstMainFragmentKey) return;
      const fragmentKey = `${frag.level}:${frag.sn}:${frag.url || ""}`;
      if (fragmentKey !== firstMainFragmentKey || firstMainFragmentLoadedAt)
        return;

      firstMainFragmentLoadedAt = getSpotliHighResolutionNow();
      const stats = data?.stats || frag.stats || {};
      const loading = stats.loading || {};
      const requestMs =
        Number(loading.end) > 0 && Number(loading.start) > 0
          ? Math.round(loading.end - loading.start)
          : null;
      const firstByteMs =
        Number(loading.first) > 0 && Number(loading.start) > 0
          ? Math.round(loading.first - loading.start)
          : null;
      const downloadMs =
        Number(loading.end) > 0 && Number(loading.first) > 0
          ? Math.round(loading.end - loading.first)
          : null;
      const loadedBytes =
        Number(stats.loaded) || data?.payload?.byteLength || 0;
      console.info("[Spotli playback] First HLS media segment downloaded", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        fragment: getFragmentDiagnostics(frag),
        rendition: getHlsLevelDiagnostics(frag.level),
        loadedBytes,
        requestMs,
        firstByteMs,
        downloadMs,
        measuredMbps:
          downloadMs > 0 && loadedBytes > 0
            ? Math.round(
                ((loadedBytes * 8) / (downloadMs / 1000) / 1_000_000) * 100,
              ) / 100
            : null,
        resourceTiming: getSpotliResourceTiming(frag.url || ""),
      });
    });

    hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
      const frag = data?.frag;
      if (
        firstMainFragmentBuffered ||
        !frag ||
        !firstMainFragmentKey ||
        `${frag.level}:${frag.sn}:${frag.url || ""}` !== firstMainFragmentKey
      ) {
        return;
      }
      firstMainFragmentBuffered = true;
      if (
        selectedStreamQuality === "auto" &&
        !autoAbrUnlocked &&
        hls &&
        !cancelled &&
        !streamInactive
      ) {
        autoAbrUnlocked = true;
        // Allow adaptive bitrate after the warmed first fragment has buffered.
        // The profile cap remains active while ABR adapts to measured throughput.
        hls.loadLevel = -1;
        hls.nextLevel = -1;
        console.info(
          "[Spotli playback] Auto adaptive bitrate enabled after startup",
          {
            playbackId: playbackDiagnosticId,
            startupRendition: getHlsLevelDiagnostics(frag.level),
            minAutoHeight: networkProfile.desktopPlayback
              ? DESKTOP_AUTO_MIN_HEIGHT
              : 0,
            maxAutoHeight: networkProfile.startupHeight,
            minAutoLevel: hls.minAutoLevel,
            autoLevelCapping: hls.autoLevelCapping,
          },
        );
      }
      console.info("[Spotli playback] First HLS media segment buffered", {
        playbackId: playbackDiagnosticId,
        elapsedMs: getPlaybackElapsedMs(),
        timeFromRequestMs: firstMainFragmentRequestedAt
          ? Math.round(
              getSpotliHighResolutionNow() - firstMainFragmentRequestedAt,
            )
          : null,
        timeFromDownloadMs: firstMainFragmentLoadedAt
          ? Math.round(getSpotliHighResolutionNow() - firstMainFragmentLoadedAt)
          : null,
        fragment: getFragmentDiagnostics(frag),
        rendition: getHlsLevelDiagnostics(frag.level),
        bufferedAheadSeconds:
          Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        readyState: video.readyState,
      });
    });

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      if (cancelled || streamInactive || !hls) return;
      publishQualityOptions();

      const availableLevels = hls.levels
        .map((level, index) => ({
          index,
          height: getQualityTierHeight(level),
          bitrate: Number(level.bitrate) || 0,
          maxBitrate: Number(level.maxBitrate) || 0,
        }))
        .filter((level) => level.height > 0);
      if (
        networkProfile.desktopPlayback &&
        !availableLevels.some(
          (level) => level.height >= DESKTOP_AUTO_MIN_HEIGHT,
        )
      ) {
        console.warn(
          "[Spotli playback] Auto HLS has no native 720p+ rendition; Cloudinary does not upscale the uploaded source, so desktop will use its highest real rendition",
          {
            playbackId: playbackDiagnosticId,
            requiredShortEdge: DESKTOP_AUTO_MIN_HEIGHT,
            cloudinaryStreamingProfile: "auto",
            availableRenditions: availableLevels.map((level) => {
              const raw = hls.levels?.[level.index] || {};
              return {
                index: level.index,
                resolution: `${Number(raw.width) || "?"}x${Number(raw.height) || "?"}`,
                shortEdge: level.height,
                bitrateKbps: Math.round(level.bitrate / 1000),
              };
            }),
            sourceLimit:
              "Cloudinary sp_auto does not upscale below-source resolutions",
          },
        );
      }
      applyAutoLevelCap();
      const startupLevel = getLevelForRequestedQuality(selectedStreamQuality);
      if (startupLevel) {
        console.info(
          selectedStreamQuality === "auto"
            ? "[Spotli playback] Auto startup rendition selected"
            : "[Spotli playback] Manual startup rendition locked",
          {
            playbackId: playbackDiagnosticId,
            elapsedMs: getPlaybackElapsedMs(),
            selectedQuality: selectedStreamQuality,
            autoMinHeight: networkProfile.desktopPlayback
              ? DESKTOP_AUTO_MIN_HEIGHT
              : 0,
            autoMaxHeight: networkProfile.startupHeight,
            autoMinLevel: hls.minAutoLevel,
            autoMinBitrateKbps: Number(hls.config?.minAutoBitrate)
              ? Math.round(Number(hls.config.minAutoBitrate) / 1000)
              : null,
            autoLevelCapping: hls.autoLevelCapping,
            autoAdaptiveAfterStartup: selectedStreamQuality === "auto",
            rendition: getHlsLevelDiagnostics(startupLevel.index),
            availableRenditions: availableLevels.map((level) => ({
              index: level.index,
              height: level.height,
              bitrateKbps: Math.round(level.bitrate / 1000),
            })),
          },
        );
        hls.startLevel = startupLevel.index;

        // Lock only the opening fragment to the exact rendition prepared by
        // the prewarmer. Auto is released to adaptive selection after it buffers.
        hls.loadLevel = startupLevel.index;
      }
      // Do not wait for any speculative preload here. On slow mobile links,
      // that promise can take several seconds because it fetches a playlist and
      // segment sequentially. Start the active player's media requests as soon
      // as the master manifest and startup level are ready.
      if (cancelled || streamInactive || !hls) return;
      streamLoadStarted = true;
      hls.startLoad(savedResumeTime >= 0.5 ? savedResumeTime : -1);
      restoreResumePosition();
      playIfRequested();
    });

    hls.on(Hls.Events.LEVELS_UPDATED, publishQualityOptions);

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      // A successfully buffered fragment means transient errors have recovered.
      networkRetries = 0;
      mediaRetries = 0;
      manualRecoveryAttempts = 0;
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (cancelled || streamInactive || !data) return;

      const errorDetails = String(data.details || "").toLowerCase();
      const startupHlsNetworkFailure =
        !streamHasPlayed &&
        data.type === Hls.ErrorTypes.NETWORK_ERROR &&
        ["manifestload", "levelload", "fragload"].some((part) =>
          errorDetails.includes(part),
        );

      if (startupHlsNetworkFailure) {
        console.warn("[Spotli playback] HLS startup request error", {
          playbackId: playbackDiagnosticId,
          elapsedMs: getPlaybackElapsedMs(),
          fatal: Boolean(data.fatal),
          details: data.details || null,
          responseCode: data.response?.code || data.response?.status || null,
          url: data.url || data.response?.url || null,
          playlistRetries: networkProfile.dataSaver ? 0 : 1,
          fragmentRetries: 0,
        });
      }

      // hls.js emits non-fatal request errors while its configured playlist
      // retry is running. Do not switch to MP4 until that retry is exhausted.
      if (startupHlsNetworkFailure && data.fatal) {
        if (
          networkProfile.desktopPlayback &&
          hls &&
          desktopStartupRetryCount < 2
        ) {
          const responseCode = Number(
            data.response?.code || data.response?.status || 0,
          );
          const isPermanentAuthFailure =
            responseCode === 401 || responseCode === 403;
          if (!isPermanentAuthFailure) {
            desktopStartupRetryCount += 1;
            const attempt = desktopStartupRetryCount;
            const retryDelayMs = attempt === 1 ? 900 : 1_800;
            const failedStage = errorDetails.includes("manifestload")
              ? "master-playlist"
              : errorDetails.includes("levelload")
                ? "rendition-playlist"
                : "media-segment";
            const timerId = setTimeout(() => {
              startupRetryTimers.delete(timerId);
              if (cancelled || streamInactive || !hls) return;
              try {
                if (failedStage === "master-playlist") {
                  // A fatal master-manifest error can leave the manifest
                  // controller stopped; loadSource explicitly restarts it.
                  hls.loadSource(hlsUrl);
                } else {
                  hls.startLoad(savedResumeTime >= 0.5 ? savedResumeTime : -1);
                }
                console.info(
                  "[Spotli playback] Retrying desktop HLS startup before fallback",
                  {
                    playbackId: playbackDiagnosticId,
                    attempt,
                    maxAttempts: 2,
                    failedStage,
                    responseCode: responseCode || null,
                    retryDelayMs,
                    desktopMinimumHeight: DESKTOP_AUTO_MIN_HEIGHT,
                  },
                );
              } catch (retryError) {
                console.warn(
                  "[Spotli playback] Desktop HLS startup retry could not restart loader",
                  {
                    playbackId: playbackDiagnosticId,
                    attempt,
                    failedStage,
                    message: retryError?.message || String(retryError),
                  },
                );
              }
            }, retryDelayMs);
            startupRetryTimers.add(timerId);
            return;
          }
        }

        if (directMp4Failed) {
          if (networkRetries < 3 && hls) {
            networkRetries += 1;
            const timerId = setTimeout(() => {
              startupRetryTimers.delete(timerId);
              if (!cancelled && !streamInactive && hls) hls.startLoad();
            }, 350 * networkRetries);
            startupRetryTimers.add(timerId);
            console.warn(
              "[Spotli playback] Retrying HLS after MP4 delivery failed",
              {
                attempt: networkRetries,
                reason: data.details || data.type,
              },
            );
            return;
          }
          console.error(
            "[Spotli playback] Direct MP4 and HLS startup both unavailable",
            {
              reason: data.details || data.type,
            },
          );
          onQualityNotice?.(
            "This video is still preparing for playback. Try again shortly.",
          );
          return;
        }
        console.info(
          "[Spotli playback] HLS playlist retry exhausted; using MP4 fallback",
          {
            reason: data.details || data.type,
          },
        );
        useProgressiveFallback();
        return;
      }

      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
        networkRetries += 1;
        hls?.startLoad();
        return;
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
        mediaRetries += 1;
        hls?.recoverMediaError();
        return;
      }

      // A manual quality choice is a lock, not a suggestion. Never silently
      // replace it with the low-bitrate MP4 fallback, even if the first HLS
      // segment has not played yet. Reapply the requested HLS level during
      // recovery; a weak network may buffer, but the picture will not downgrade.
      if (selectedStreamQuality !== "auto" && hls) {
        const fixedTarget = getLevelForRequestedQuality(selectedStreamQuality);
        if (fixedTarget) {
          hls.autoLevelCapping = -1;
          hls.startLevel = fixedTarget.index;
          hls.loadLevel = fixedTarget.index;
        }

        if (manualRecoveryAttempts < 8) {
          manualRecoveryAttempts += 1;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.startLoad();
          }
        }
        return;
      }

      useProgressiveFallback();
    });

    hls.attachMedia(video);
  };

  start().catch((error) => {
    // Don't cycle back to a direct MP4 request that has already failed. Keep
    // the failure visible and preserve the HLS fallback path for a retry.
    if (cancelled || streamInactive) return;
    if (directMp4Failed) {
      console.error(
        "[Spotli playback] HLS fallback initialization failed",
        error,
      );
      onQualityNotice?.(
        "This video is temporarily unavailable. Please try again shortly.",
      );
      return;
    }
    if (selectedStreamQuality !== "auto") {
      const nativeHlsSupported = Boolean(
        video.canPlayType("application/vnd.apple.mpegurl"),
      );
      if (nativeHlsSupported) {
        startNativeHls();
      } else {
        console.error(
          "Spotli could not initialize HLS for the manually selected quality.",
        );
      }
      return;
    }
    useProgressiveFallback();
  });

  const deactivateRetainedDesktopHls = () => {
    if (cancelled || streamInactive || !hls) return;
    rememberPosition();
    streamInactive = true;
    try {
      video.pause();
      hls.stopLoad();
      video.preload = "metadata";
      video.setAttribute("preload", "metadata");
    } catch (error) {
      console.warn("[Spotli playback] Desktop HLS pause/retain warning", error);
    }
    const retainedTime = Math.max(0, Number(video.currentTime) || 0);
    onRememberPosition?.(retainedTime);
    storeRetainedDesktopHlsController(video, {
      sourceUrl: originalUrl,
      profileKey: retainedDesktopProfileKey,
      activate: (nextResumeTime = retainedTime, shouldStartPlaying = true) => {
        if (cancelled || !hls) return;
        streamInactive = false;
        const requestedTime = Number(nextResumeTime);
        const targetTime =
          Number.isFinite(requestedTime) && requestedTime >= 0
            ? requestedTime
            : Math.max(0, Number(video.currentTime) || 0);
        try {
          if (
            video.readyState >= 1 &&
            Math.abs((Number(video.currentTime) || 0) - targetTime) > 0.25
          ) {
            video.currentTime = targetTime;
          }
        } catch {
          // Existing buffered playhead remains the fallback if seeking is not ready.
        }
        video.preload = "auto";
        video.setAttribute("preload", "auto");
        try {
          hls.startLoad(targetTime >= 0.5 ? targetTime : -1);
        } catch (error) {
          console.warn(
            "[Spotli playback] Retained desktop HLS restart warning",
            error,
          );
        }
        if (shouldStartPlaying && shouldPlay()) playIfRequested();
        console.info("[Spotli playback] Desktop HLS buffer reactivated", {
          asset: sourceParts?.assetPath || null,
          targetTimeSeconds: Math.round(targetTime * 100) / 100,
          actualTimeSeconds:
            Math.round((Number(video.currentTime) || 0) * 100) / 100,
          readyState: video.readyState,
          bufferedAheadSeconds:
            Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        });
      },
      deactivate: deactivateRetainedDesktopHls,
      destroy: () => {
        if (cancelled) return;
        cancelled = true;
        streamInactive = false;
        if (directMp4ErrorHandler) {
          video.removeEventListener("error", directMp4ErrorHandler);
          directMp4ErrorHandler = null;
        }
        for (const timerId of startupRetryTimers) clearTimeout(timerId);
        startupRetryTimers.clear();
        video.removeEventListener("error", onNativeHlsError);
        video.removeEventListener("loadeddata", onMediaReady);
        video.removeEventListener("canplay", onMediaReady);
        video.removeEventListener("playing", onVideoPlaying);
        video.removeEventListener("waiting", onVideoWaiting);
        video.removeEventListener("timeupdate", rememberPosition);
        video.removeEventListener("loadstart", onMediaLoadStart);
        video.removeEventListener("progress", onMediaProgress);
        video.removeEventListener("stalled", onMediaStalled);
        video.removeEventListener("suspend", onMediaSuspend);
        video.removeEventListener("loadedmetadata", onMediaLoadedMetadata);
        video.removeEventListener("loadedmetadata", restoreResumePosition);
        video.removeEventListener("durationchange", restoreResumePosition);
        video.removeEventListener("seeked", onResumeSeeked);
        try {
          video.pause();
          hls?.destroy();
          hls = null;
          video.removeAttribute("src");
          video.load();
        } catch {}
      },
    });
    console.info(
      "[Spotli playback] Retaining paused desktop HLS buffer for instant resume",
      {
        playbackId: playbackDiagnosticId,
        asset: sourceParts?.assetPath || null,
        currentTimeSeconds: Math.round(retainedTime * 100) / 100,
        readyState: video.readyState,
        bufferedAheadSeconds:
          Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
        retainedControllerCount: retainedDesktopHlsControllers.size,
      },
    );
  };

  return () => {
    const canRetainDesktopHls = Boolean(
      attachNetworkProfile.desktopPlayback &&
      initialQualityKey === "auto" &&
      !hasLocalUploadCopy &&
      hls &&
      video.isConnected,
    );
    if (canRetainDesktopHls) {
      deactivateRetainedDesktopHls();
      onQualityControllerChange?.(null);
      onQualityOptionsChange?.([]);
      return;
    }

    cancelled = true;
    rememberPosition();
    if (directMp4ErrorHandler) {
      video.removeEventListener("error", directMp4ErrorHandler);
      directMp4ErrorHandler = null;
    }
    for (const timerId of startupRetryTimers) clearTimeout(timerId);
    startupRetryTimers.clear();
    video.removeEventListener("error", onNativeHlsError);
    video.removeEventListener("loadeddata", onMediaReady);
    video.removeEventListener("canplay", onMediaReady);
    video.removeEventListener("playing", onVideoPlaying);
    video.removeEventListener("waiting", onVideoWaiting);
    video.removeEventListener("timeupdate", rememberPosition);
    video.removeEventListener("loadstart", onMediaLoadStart);
    video.removeEventListener("progress", onMediaProgress);
    video.removeEventListener("stalled", onMediaStalled);
    video.removeEventListener("suspend", onMediaSuspend);
    video.removeEventListener("loadedmetadata", onMediaLoadedMetadata);
    video.removeEventListener("loadedmetadata", restoreResumePosition);
    video.removeEventListener("durationchange", restoreResumePosition);
    video.removeEventListener("seeked", onResumeSeeked);
    const canRetainProgressiveBuffer = (() => {
      if (!retainProgressiveBufferOnDeactivate || hls || !video.isConnected) {
        return false;
      }

      let currentSrc = String(video.currentSrc || video.src || "");
      let expectedSrc = String(expectedProgressiveSource || fallbackUrl || "");
      try {
        if (currentSrc) currentSrc = new URL(currentSrc, document.baseURI).href;
        if (expectedSrc)
          expectedSrc = new URL(expectedSrc, document.baseURI).href;
      } catch {
        // Keep the original strings if URL normalization is unavailable.
      }

      const desktopRequestStillLoading = Boolean(
        attachNetworkProfile.desktopPlayback &&
        video.readyState === 0 &&
        video.networkState === 2 &&
        !video.error,
      );
      return Boolean(
        currentSrc &&
        expectedSrc &&
        currentSrc === expectedSrc &&
        (/\.mp4(?:[?#]|$)/i.test(currentSrc) ||
          currentSrc.startsWith("blob:")) &&
        !video.error &&
        (video.readyState > 0 || desktopRequestStillLoading),
      );
    })();

    if (hls) {
      hls.destroy();
      hls = null;
    }
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);
    video.pause();
    if (video.isConnected) {
      if (canRetainProgressiveBuffer) {
        // Do not clear src or call load(): both operations discard the decoded
        // frame and buffered media. The same per-post element is reused when
        // the user scrolls back. Metadata preload avoids aggressively fetching
        // the rest of an inactive video while keeping its current buffer alive.
        video.autoplay = false;
        video.preload = "metadata";
        const liveTimeAtDeactivate = Number(video.currentTime);
        const retainedCurrentTime =
          Number.isFinite(liveTimeAtDeactivate) && liveTimeAtDeactivate >= 0
            ? liveTimeAtDeactivate
            : savedResumeTime;
        const retainedRecord = {
          sourceUrl: expectedProgressiveSource,
          assetKey: sourceParts?.assetPathWithoutExtension || null,
          currentTime: retainedCurrentTime,
          retainedAt: Date.now(),
          readyState: video.readyState,
          networkState: video.networkState,
          bufferedAheadSeconds: getSpotliBufferedAheadSeconds(video),
          postId: video.dataset?.postId || null,
        };
        retainedProgressiveMedia.set(video, retainedRecord);
        const desktopRequestStillLoading = Boolean(
          attachNetworkProfile.desktopPlayback &&
          video.readyState === 0 &&
          video.networkState === 2 &&
          !video.error,
        );
        if (desktopRequestStillLoading) {
          trackRetainedDesktopInflightMp4Request(video, retainedRecord);
        }
        onRememberPosition?.(retainedCurrentTime);
        console.info(
          desktopRequestStillLoading
            ? "[Spotli playback] Retaining in-flight desktop MP4 request before metadata"
            : attachNetworkProfile.desktopPlayback
              ? "[Spotli playback] Retaining paused desktop MP4 source and buffer for instant resume"
              : "[Spotli playback] Retaining paused mobile MP4 source and buffer for instant resume",
          {
            playbackId: playbackDiagnosticId,
            asset: sourceParts?.assetPath || null,
            currentTimeSeconds: Math.round(retainedCurrentTime * 100) / 100,
            readyState: video.readyState,
            networkState: video.networkState,
            requestPreserved: desktopRequestStillLoading,
            bufferedAheadSeconds:
              Math.round(getSpotliBufferedAheadSeconds(video) * 100) / 100,
            sourceUrlMatches: true,
          },
        );
      } else {
        retainedProgressiveMedia.delete(video);
        video.removeAttribute("src");
        video.load();
      }
    }
  };
}

function createTabletViewerImplementation() {
  // Keep the original tablet viewer's imports scoped to its implementation.
  const useEffect = tablet_useEffect;
  const useRef = tablet_useRef;
  const useState = tablet_useState;
  const useCallback = tablet_useCallback;
  const useMemo = tablet_useMemo;
  const CommentSection = tablet_CommentSection;
  const api = tablet_api;
  const ArrowLeft = tablet_ArrowLeft;
  const Heart = tablet_Heart;
  const MessageCircle = tablet_MessageCircle;
  const Share2 = tablet_Share2;
  const MoreVertical = tablet_MoreVertical;
  const Play = tablet_Play;
  const Pause = tablet_Pause;
  const Volume2 = tablet_Volume2;
  const VolumeX = tablet_VolumeX;
  const Maximize = tablet_Maximize;
  const Settings = tablet_Settings;
  const Captions = tablet_Captions;
  const Bookmark = tablet_Bookmark;
  const Trash2 = tablet_Trash2;
  const ChevronUp = tablet_ChevronUp;
  const ChevronDown = tablet_ChevronDown;

  const API_ORIGIN = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  ).replace(/\/api\/?$/, "");

  const DEMO_VIDEO =
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

  const getPostId = (post) => post?.id || post?._id;

  function resolveMediaUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    if (/^https?:\/\//i.test(value)) return value;

    if (value.startsWith("/")) return `${API_ORIGIN}${value}`;

    return value;
  }

  function getAvatarUrl(post) {
    const creator =
      post?.creator && typeof post.creator === "object" ? post.creator : {};

    const user = post?.user && typeof post.user === "object" ? post.user : {};

    return resolveMediaUrl(
      post?.creatorAvatar ||
        creator.avatar ||
        creator.profilePicture ||
        creator.profileImage ||
        creator.avatarUrl ||
        user.avatar ||
        user.profilePicture ||
        user.profileImage ||
        user.avatarUrl ||
        post?.avatar ||
        post?.profileImage ||
        post?.profilePicture ||
        "",
    );
  }

  function getCreatorName(post) {
    const creator =
      post?.creator && typeof post.creator === "object" ? post.creator : {};

    const user = post?.user && typeof post.user === "object" ? post.user : {};

    if (typeof post?.creator === "string" && post.creator.trim()) {
      return post.creator;
    }

    return (
      [creator.firstName, creator.lastName].filter(Boolean).join(" ") ||
      creator.username ||
      creator.name ||
      user.username ||
      user.name ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      post?.username ||
      post?.name ||
      "Spotli creator"
    );
  }

  function getCreatorHandle(post) {
    const creator =
      post?.creator && typeof post.creator === "object" ? post.creator : {};

    const user = post?.user && typeof post.user === "object" ? post.user : {};

    return (
      post?.handle ||
      creator.handle ||
      creator.username ||
      user.handle ||
      user.username ||
      ""
    );
  }

  function getPostTypeValues(post) {
    return [post?.mediaType, post?.type, post?.postType, post?.kind]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }

  function mediaValueToUrl(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    return (
      value.url ||
      value.src ||
      value.imageUrl ||
      value.videoUrl ||
      value.secure_url ||
      value.path ||
      value.location ||
      ""
    );
  }

  function looksLikeImageMedia(value) {
    const url = mediaValueToUrl(value);
    return /(?:\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#]|$)|\/image\/upload\/|^data:image\/)/i.test(
      url,
    );
  }

  function looksLikeVideoMedia(value) {
    const url = mediaValueToUrl(value);
    return /(?:\.(?:mp4|mov|m4v|webm|avi|mkv|m3u8|mpd)(?:[?#]|$)|\/video\/upload\/|^data:video\/)/i.test(
      url,
    );
  }

  function isDeclaredPhotoPost(post) {
    const mediaType = String(post?.mediaType || "")
      .trim()
      .toLowerCase();
    if (["image", "photo", "photos", "gallery"].includes(mediaType))
      return true;
    if (["video", "reel"].includes(mediaType)) return false;

    const otherTypes = [post?.type, post?.postType, post?.kind]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (
      otherTypes.some((type) =>
        ["image", "photo", "photos", "gallery"].includes(type),
      )
    )
      return true;
    if (otherTypes.some((type) => ["video", "reel"].includes(type)))
      return false;

    return (
      post?.isImagePost === true ||
      post?.isPhotoPost === true ||
      String(post?.mimeType || post?.mimetype || "")
        .toLowerCase()
        .startsWith("image/")
    );
  }

  function isExplicitVideoPost(post) {
    const mediaType = String(post?.mediaType || "")
      .trim()
      .toLowerCase();
    if (["video", "reel"].includes(mediaType)) return true;
    if (["image", "photo", "photos", "gallery"].includes(mediaType))
      return false;

    const otherTypes = [post?.type, post?.postType, post?.kind]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (otherTypes.some((type) => ["video", "reel"].includes(type)))
      return true;
    if (
      otherTypes.some((type) =>
        ["image", "photo", "photos", "gallery"].includes(type),
      )
    )
      return false;

    return (
      post?.isVideoPost === true ||
      Boolean(post?.videoUrl || post?.videoFile || post?.videos?.length) ||
      looksLikeVideoMedia(post?.video) ||
      looksLikeVideoMedia(post?.mediaUrl) ||
      looksLikeVideoMedia(post?.media) ||
      looksLikeVideoMedia(post?.mediaUrls?.[0])
    );
  }

  function getPostImages(post) {
    const imageLike = (value) => {
      const url = mediaValueToUrl(value);
      return url ? resolveMediaUrl(url) : "";
    };
    const photoPost =
      isDeclaredPhotoPost(post) ||
      [post?.mediaUrl, post?.media, post?.mediaUrls?.[0]].some(
        looksLikeImageMedia,
      );
    const sources = [
      ...(Array.isArray(post?.images) ? post.images : []),
      ...(Array.isArray(post?.mediaUrls) ? post.mediaUrls : []),
      ...(Array.isArray(post?.photos) ? post.photos : []),
      post?.imageUrl,
      post?.image,
      post?.photoUrl,
      ...(photoPost ? [post?.mediaUrl, post?.media] : []),
    ];

    const images = sources.map(imageLike).filter(Boolean);
    if (images.length) return [...new Set(images)];

    const single = mediaValueToUrl(
      post?.imageUrl ||
        post?.image ||
        post?.photoUrl ||
        (photoPost ? post?.mediaUrl || post?.media : "") ||
        post?.thumbnailUrl ||
        post?.thumbnail ||
        "",
    );
    if (!single) return [];

    if (/^(?:https?:|data:|blob:)/i.test(single) || single.startsWith("/")) {
      return [resolveMediaUrl(single)];
    }

    if (/^photo-/i.test(single)) {
      return [
        `https://images.unsplash.com/${single}?auto=format&fit=crop&w=1200&q=90`,
      ];
    }
    return [];
  }

  function getOriginalVideoUrl(post) {
    // One canonical resolver is shared with Home and MainLayout so every
    // prewarm and the active player request the exact same Cloudinary asset.
    const rawUrl = getSpotliPrefetchOriginalVideoUrl(post);
    return rawUrl ? resolveMediaUrl(rawUrl) : "";
  }

  function getVideoUrl(post) {
    return getOptimizedPlaybackUrl(getOriginalVideoUrl(post));
  }

  function isPhotoPost(post) {
    if (isDeclaredPhotoPost(post)) return true;
    if (isExplicitVideoPost(post)) return false;

    const ambiguousMedia = [post?.mediaUrl, post?.media, post?.mediaUrls?.[0]];
    if (ambiguousMedia.some(looksLikeImageMedia)) return true;
    if (Array.isArray(post?.photos) && post.photos.length) return true;
    if (Array.isArray(post?.images) && post.images.length && !getVideoUrl(post))
      return true;

    return !getVideoUrl(post) && getPostImages(post).length > 0;
  }

  function formatCount(value) {
    const number = Number(value) || 0;

    if (number >= 1_000_000) {
      return `${(number / 1_000_000).toFixed(1).replace(/\\.0$/, "")}M`;
    }

    if (number >= 1_000) {
      return `${(number / 1_000).toFixed(1).replace(/\\.0$/, "")}K`;
    }

    return String(number);
  }

  function TabletVideoViewer({
    posts: sourcePosts = [],

    initialPost,

    preservePostOrder = false,

    initialPostIndex = null,

    onBack,
    currentUserId = "",
    onDeletePost,
  }) {
    // Profile viewers preserve the supplied grid order. Other entry points keep
    // their existing selected-first shuffled behavior.
    const initialPostId = getPostId(initialPost);

    const posts = useMemo(() => {
      if (preservePostOrder) {
        const containsInitial = sourcePosts.some(
          (post) =>
            post === initialPost ||
            String(getPostId(post)) === String(initialPostId),
        );
        if (containsInitial) return sourcePosts;
        if (!initialPost) return sourcePosts;

        // If post identifiers were normalized differently by a caller, retain
        // the profile order and restore the selected post at its original index
        // rather than moving it to the beginning (which made earlier videos
        // impossible to reach by scrolling backwards).
        if (Number.isInteger(initialPostIndex) && initialPostIndex >= 0) {
          const ordered = [...sourcePosts];
          const safeIndex = Math.min(initialPostIndex, ordered.length);
          if (safeIndex < ordered.length) ordered[safeIndex] = initialPost;
          else ordered.splice(safeIndex, 0, initialPost);
          return ordered;
        }

        return [initialPost, ...sourcePosts];
      }

      if (initialPostId == null) return sourcePosts;

      const selectedPost =
        sourcePosts.find(
          (post) => String(getPostId(post)) === String(initialPostId),
        ) || initialPost;

      if (!selectedPost) return sourcePosts;

      const remainingPosts = sourcePosts.filter(
        (post) => String(getPostId(post)) !== String(initialPostId),
      );

      for (let i = remainingPosts.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingPosts[i], remainingPosts[j]] = [
          remainingPosts[j],
          remainingPosts[i],
        ];
      }

      return [selectedPost, ...remainingPosts];
    }, [
      sourcePosts,
      initialPostId,
      initialPost,
      preservePostOrder,
      initialPostIndex,
    ]);

    const feedRef = useRef(null);

    const videoRefs = useRef({});
    const playbackPositionsRef = useRef(new Map());

    const postRefs = useRef({});

    const tapTimerRef = useRef(null);

    const detailsTimerRef = useRef(null);
    const playbackTimerRef = useRef(null);

    const loveTimerRef = useRef({});

    const lastTapRef = useRef({ time: 0, postId: null });

    const activeIndexRef = useRef(0);

    const scrollFrameRef = useRef(null);
    const lastFeedScrollTopRef = useRef(0);
    const scrollIntentPrewarmedPostIdsRef = useRef(new Set());
    const scrollIntentDeferredLogAtRef = useRef(new Map());

    const initialScrollDoneRef = useRef(false);
    const [initialPlacementReady, setInitialPlacementReady] = useState(false);

    const [activeIndex, setActiveIndex] = useState(() => {
      const initialId = getPostId(initialPost);
      const index = posts.findIndex(
        (post) =>
          post === initialPost || String(getPostId(post)) === String(initialId),
      );
      if (index >= 0) return index;
      return Number.isInteger(initialPostIndex) && initialPostIndex >= 0
        ? Math.min(initialPostIndex, Math.max(posts.length - 1, 0))
        : 0;
    });

    const [likedPosts, setLikedPosts] = useState({});
    const [openPostOptionsId, setOpenPostOptionsId] = useState(null);

    const [bookmarkedPosts, setBookmarkedPosts] = useState({});
    const bookmarkRequestsRef = useRef(new Set());
    const userChangedBookmarksRef = useRef(new Set());

    const [likeCounts, setLikeCounts] = useState({});
    // Refs keep rapid taps and in-flight API requests in sync with the latest intent.
    const likedPostsRef = useRef({});

    const likeCountsRef = useRef({});

    const confirmedLikeCountsRef = useRef({});

    const likeRequestsRef = useRef(new Set());

    const userChangedLikesRef = useRef(new Set());

    const [detailsVisible, setDetailsVisible] = useState(true);
    const [playbackVisible, setPlaybackVisible] = useState(true);

    const [commentsPost, setCommentsPost] = useState(null);

    const [comments, setComments] = useState([]);

    const [commentCounts, setCommentCounts] = useState({});

    const [commentsLoading, setCommentsLoading] = useState(false);

    const [commentsError, setCommentsError] = useState("");

    const [followedCreators, setFollowedCreators] = useState({});

    const [paused, setPaused] = useState(false);
    // Keep the poster over the video surface until the browser reports that
    // real playback has begun. This avoids a black flash while HLS initializes.
    const [playingVideoPostId, setPlayingVideoPostId] = useState(null);
    const [muted, setMuted] = useState(() =>
      Boolean(getSavedPlaybackPreference("startMuted", true)),
    );
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [, setProgress] = useState({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [networkQualityNotice, setNetworkQualityNotice] = useState("");
    const [dataSaverEnabled, setDataSaverEnabled] = useState(
      () => getNetworkPlaybackProfile().dataSaver,
    );
    const qualityNoticeTimerRef = useRef(null);
    function showNetworkQualityNotice(message) {
      setNetworkQualityNotice(message);
      if (qualityNoticeTimerRef.current) {
        window.clearTimeout(qualityNoticeTimerRef.current);
      }
      qualityNoticeTimerRef.current = window.setTimeout(() => {
        setNetworkQualityNotice("");
        qualityNoticeTimerRef.current = null;
      }, 4800);
    }
    useEffect(
      () => () => {
        if (qualityNoticeTimerRef.current) {
          window.clearTimeout(qualityNoticeTimerRef.current);
        }
      },
      [],
    );
    useEffect(() => {
      const handlePlaybackSettingsUpdate = (event) => {
        const hasManualChoice =
          event?.detail?.dataSaverUserChoice === true &&
          typeof event?.detail?.dataSaver === "boolean";
        setDataSaverEnabled(
          hasManualChoice
            ? event.detail.dataSaver
            : getNetworkPlaybackProfile().dataSaver,
        );
      };
      const connection =
        typeof navigator !== "undefined"
          ? navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection
          : null;
      window.addEventListener(
        "spotli:settings-updated",
        handlePlaybackSettingsUpdate,
      );
      connection?.addEventListener?.("change", handlePlaybackSettingsUpdate);
      return () => {
        window.removeEventListener(
          "spotli:settings-updated",
          handlePlaybackSettingsUpdate,
        );
        connection?.removeEventListener?.(
          "change",
          handlePlaybackSettingsUpdate,
        );
      };
    }, []);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(
      () => Number(getSavedPlaybackPreference("playbackRate", "1")) || 1,
    );
    const [playbackFeedback, setPlaybackFeedback] = useState(null);
    const playbackFeedbackTimerRef = useRef(null);
    const playbackFeedbackKeyRef = useRef(0);

    const [photoIndexes, setPhotoIndexes] = useState({});

    const [videoOrientations, setVideoOrientations] = useState({});

    const [loveAnimations, setLoveAnimations] = useState({});

    const feedPreloadPostIdsKey = posts
      .map((post) => String(getPostId(post)))
      .join("|");

    const activePost = posts[activeIndex];
    const activePostId = getPostId(activePost);

    // Cloudinary sources are attached only when the actual per-post MP4
    // preloader or active player claims that element. This avoids detached
    // HLS requests and lets the same element become active after a swipe.

    useEffect(() => {
      // Every newly selected post should show its poster until its own video
      // emits `playing`; don't reuse the previous video's ready state.
      setPlayingVideoPostId(null);
    }, [activePostId]);
    const activeOriginalVideoUrl = getOriginalVideoUrl(activePost);
    const activePostIsPhoto = isPhotoPost(activePost);
    const shouldPlayActiveVideoRef = useRef(!paused);
    shouldPlayActiveVideoRef.current = !paused;

    // Auto starts the actual per-post progressive MP4 element. The helper
    // retains that source/buffer for instant mobile/tablet resume and uses HLS
    // only if Cloudinary MP4 delivery fails.
    useEffect(() => {
      if (!activePostId || activePostIsPhoto || !activeOriginalVideoUrl) {
        return undefined;
      }

      const video = videoRefs.current[activePostId];
      if (!video || !getCloudinaryHlsUrl(activeOriginalVideoUrl)) {
        return undefined;
      }

      return attachCloudinaryAdaptiveStream(
        video,
        activeOriginalVideoUrl,
        getOptimizedPlaybackUrl(activeOriginalVideoUrl),
        () => shouldPlayActiveVideoRef.current,
        () => setMuted(true),
        undefined,
        undefined,
        "auto",
        playbackPositionsRef.current.get(String(activePostId)) || 0,
        (time) => {
          if (Number.isFinite(time) && time >= 0) {
            playbackPositionsRef.current.set(String(activePostId), time);
          }
        },
        showNetworkQualityNotice,
      );
    }, [
      activePostId,
      activeOriginalVideoUrl,
      activePostIsPhoto,
      dataSaverEnabled,
    ]);

    // While the current video plays, prime only the immediate next video.
    // Reuse the same card element and HLS warm-resource cache on activation.
    // The observer is close to the viewport so unviewed feed items don't consume
    // data far ahead of the viewer's scroll position.
    useEffect(() => {
      const playbackProfile = getNetworkPlaybackProfile();
      if (!playbackProfile.desktopPlayback || !browserCanUseHlsJs())
        return undefined;
      const feed = feedRef.current;
      if (!feed || typeof IntersectionObserver === "undefined") {
        return undefined;
      }

      const candidateByElement = new Map();
      posts.forEach((post, index) => {
        const element = postRefs.current[getPostId(post)];
        if (element) candidateByElement.set(element, { post, index });
      });
      if (!candidateByElement.size) return undefined;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const candidate = candidateByElement.get(entry.target);
            if (!candidate) {
              observer.unobserve(entry.target);
              continue;
            }

            const currentIndex = activeIndexRef.current;
            if (candidate.index <= currentIndex) {
              observer.unobserve(entry.target);
              continue;
            }

            // Only prewarm the immediate next post, and only when it is close
            // to the viewport and the active video has a small safety buffer.
            // The network profile permits one segment on normal mobile links,
            // but honours explicit Save Data and very slow-link settings.
            if (candidate.index !== currentIndex + 1) continue;
            const currentPost = posts[currentIndex];
            const currentVideo = currentPost
              ? videoRefs.current[getPostId(currentPost)]
              : null;
            if (!currentVideo || currentVideo.readyState < 2) continue;
            const currentBufferedAhead =
              getSpotliBufferedAheadSeconds(currentVideo);
            const minimumAheadForEarlySegment = getNetworkPlaybackProfile()
              .constrained
              ? 1.0
              : 0.5;
            if (currentBufferedAhead < minimumAheadForEarlySegment) continue;

            observer.unobserve(entry.target);
            if (isPhotoPost(candidate.post)) continue;

            const nextUrl = getOriginalVideoUrl(candidate.post);
            if (getCloudinaryHlsUrl(nextUrl)) {
              const nextVideoElement =
                videoRefs.current[getPostId(candidate.post)];
              console.info(
                "[Spotli playback] Early next HLS segment prewarm started",
                {
                  source: "home-viewport-observer",
                  bufferedAheadSeconds:
                    Math.round(currentBufferedAhead * 100) / 100,
                  nextAsset:
                    getSpotliCloudinaryAssetParts(nextUrl)
                      ?.assetPathWithoutExtension || null,
                },
              );
              const nextPolicy = getUpcomingVideoChunkPreloadPolicy();
              preloadNextVideoPlayback(nextUrl, {
                videoElement: nextVideoElement,
                partialBytes: nextPolicy.segmentBytes,
                fallbackMp4OnWarmFailure: false,
                aggressive: false,
              });
            }
          }
        },
        {
          root: feed,
          // Start warming the next snap page before it enters the visible area.
          rootMargin: "0px 0px 100% 0px",
          threshold: 0.01,
        },
      );

      candidateByElement.forEach(({ index }, element) => {
        if (index > activeIndex) observer.observe(element);
      });

      return () => observer.disconnect();
    }, [feedPreloadPostIdsKey, activeIndex]);

    // Warm the next two videos before the user reaches them. Mobile Auto warms
    // the actual feed-card MP4 element; desktop HLS profiles warm a byte prefix.
    // The queue always completes the immediate next video before the second.
    useEffect(() => {
      const queueNetworkProfile = getNetworkPlaybackProfile();
      const mobileMp4Queue = !queueNetworkProfile.desktopPlayback;
      if (
        !activePostId ||
        String(playingVideoPostId) !== String(activePostId) ||
        (!browserCanUseHlsJs() && !mobileMp4Queue)
      ) {
        return undefined;
      }

      const activeVideo = videoRefs.current[activePostId];
      if (!activeVideo) return undefined;

      const candidates = getNextVideoWarmCandidates(posts, activeIndex, 2);
      if (!candidates.length) return undefined;

      const policy = getUpcomingVideoChunkPreloadPolicy();
      let disposed = false;
      let preloading = false;
      let candidateIndex = 0;
      let lastAttemptAt = 0;
      let activeVideoWaiting = false;

      const cleanupListeners = () => {
        activeVideo.removeEventListener(
          "timeupdate",
          maybePreloadUpcomingChunks,
        );
        activeVideo.removeEventListener("progress", maybePreloadUpcomingChunks);
        activeVideo.removeEventListener("playing", onActiveVideoRecovered);
        activeVideo.removeEventListener("waiting", onActiveVideoWaiting);
        activeVideo.removeEventListener("stalled", onActiveVideoWaiting);
        activeVideo.removeEventListener("pause", onActiveVideoWaiting);
        activeVideo.removeEventListener("seeking", onActiveVideoWaiting);
        activeVideo.removeEventListener("seeked", onActiveVideoRecovered);
      };

      const pauseSpeculativePreloads = (reason) => {
        if (mobileMp4Queue) {
          setFeedVideoPreloadPriority(false, activeVideo, reason);
        }
      };

      const onActiveVideoWaiting = (event) => {
        activeVideoWaiting = true;
        pauseSpeculativePreloads(event?.type || "active-video-waiting");
      };

      const onActiveVideoRecovered = () => {
        activeVideoWaiting = false;
        const bufferedAhead = getSpotliBufferedAheadSeconds(activeVideo);
        const canResume = Boolean(
          !activeVideo.paused &&
          !activeVideo.ended &&
          bufferedAhead >= policy.minimumBufferedAheadSeconds,
        );
        if (mobileMp4Queue) {
          setFeedVideoPreloadPriority(
            canResume,
            activeVideo,
            canResume ? "active-buffer-recovered" : "active-buffer-still-low",
          );
        }
        maybePreloadUpcomingChunks();
      };

      // The serialized chunk queue owns each candidate's playlist and media
      // prefix. Avoid a separate metadata-only request for the same asset;
      // swipe intent and viewport observers join this exact queued task.

      const maybePreloadUpcomingChunks = async () => {
        if (disposed) return;

        const bufferedAhead = getSpotliBufferedAheadSeconds(activeVideo);
        if (mobileMp4Queue) {
          const yieldThreshold = policy.yieldBelowBufferedAheadSeconds || 2;
          // Hysteresis: begin speculative work at the profile's start
          // threshold, then keep the first-frame request alive until the
          // active buffer reaches the lower yield threshold. This avoids
          // rapid pause/resume oscillation while protecting active playback.
          const canContinueSpeculativeWork =
            !activeVideoWaiting &&
            !activeVideo.paused &&
            !activeVideo.ended &&
            (feedVideoPreloadsAllowed
              ? bufferedAhead >= yieldThreshold
              : bufferedAhead >= policy.minimumBufferedAheadSeconds);
          setFeedVideoPreloadPriority(
            canContinueSpeculativeWork,
            activeVideo,
            activeVideoWaiting
              ? "active-video-waiting"
              : activeVideo.paused || activeVideo.ended
                ? "active-video-paused"
                : bufferedAhead < yieldThreshold
                  ? "active-buffer-below-2s"
                  : bufferedAhead < policy.minimumBufferedAheadSeconds &&
                      !feedVideoPreloadsAllowed
                    ? "active-buffer-below-preload-start-threshold"
                    : "active-buffer-recovered",
          );
          if (!canContinueSpeculativeWork) return;
        } else if (activeVideo.paused || activeVideo.ended) {
          return;
        }

        // Even while a next-video request is in flight, the function above
        // keeps checking active-buffer pressure and can yield that request.
        if (preloading || candidateIndex >= candidates.length) return;

        const now = Date.now();
        if (now - lastAttemptAt < 900) return;
        const requiredBufferedAheadSeconds =
          candidateIndex === 0
            ? policy.minimumBufferedAheadSeconds
            : policy.secondVideoBufferedAheadSeconds ||
              policy.minimumBufferedAheadSeconds + 4;

        if (bufferedAhead < requiredBufferedAheadSeconds) return;

        const candidate = candidates[candidateIndex];
        if (!candidate) return;
        preloading = true;
        lastAttemptAt = now;

        const candidatePostId = candidate.post
          ? String(getPostId(candidate.post) || "")
          : "";
        const candidateAsset =
          getSpotliCloudinaryAssetParts(candidate.url)
            ?.assetPathWithoutExtension || null;
        console.info(
          `[Spotli playback] Preloading upcoming video ${mobileMp4Queue ? "MP4 first frame" : "HLS byte prefix"}`,
          {
            source: "mobile-active-playback-buffer",
            postId: candidatePostId || null,
            asset: candidateAsset,
            upcomingIndex: candidate.index,
            queuePosition: candidateIndex + 1,
            preloadMode: mobileMp4Queue
              ? "progressive-mp4-first-frame"
              : "hls-byte-prefix",
            prefetchBudgetBytes: mobileMp4Queue ? null : policy.segmentBytes,
            profile: policy.label,
            priority:
              candidateIndex === 0 ? "next-video" : "second-upcoming-video",
            targetHeight: mobileMp4Queue
              ? queueNetworkProfile.progressiveFallbackHeight
              : queueNetworkProfile.startupHeight,
            targetBitrate: mobileMp4Queue
              ? queueNetworkProfile.progressiveFallbackBitrate
              : null,
            activeBufferedAheadSeconds: Math.round(bufferedAhead * 100) / 100,
            requiredBufferedAheadSeconds,
            yieldBelowBufferedAheadSeconds: mobileMp4Queue
              ? policy.yieldBelowBufferedAheadSeconds
              : null,
          },
        );

        try {
          const candidateVideoElement = candidate.post
            ? videoRefs.current[getPostId(candidate.post)]
            : null;
          const warmed = await preloadNextVideoPlayback(candidate.url, {
            videoElement: candidateVideoElement,
            postId: candidatePostId,
            priority:
              candidateIndex === 0 ? "next-video" : "second-upcoming-video",
            partialBytes: policy.segmentBytes,
            fallbackMp4OnWarmFailure: false,
          });
          if (disposed) return;
          // Move on even when Range isn't supported. A failed speculative warm
          // must not keep retrying and competing with the current video.
          candidateIndex += 1;
          console.info("[Spotli playback] Upcoming video preload result", {
            postId: candidatePostId || null,
            asset: candidateAsset,
            queuePosition: candidateIndex,
            warmed: warmed === true,
            nextCandidateAvailable: candidateIndex < candidates.length,
          });
        } catch (error) {
          candidateIndex += 1;
          console.warn(
            "[Spotli playback] Upcoming video chunk preload failed",
            {
              reason: error?.message || String(error || "unknown error"),
              upcomingIndex: candidate.index,
            },
          );
        } finally {
          preloading = false;
        }

        if (candidateIndex >= candidates.length) {
          cleanupListeners();
          return;
        }

        // Recheck buffer after the first chunk. The second video is only warmed
        // when enough playback remains; otherwise the next media event retries.
        if (
          getSpotliBufferedAheadSeconds(activeVideo) >=
          policy.minimumBufferedAheadSeconds
        ) {
          maybePreloadUpcomingChunks();
        }
      };

      if (mobileMp4Queue) {
        activeVideo.addEventListener("waiting", onActiveVideoWaiting);
        activeVideo.addEventListener("stalled", onActiveVideoWaiting);
        activeVideo.addEventListener("pause", onActiveVideoWaiting);
        activeVideo.addEventListener("seeking", onActiveVideoWaiting);
        activeVideo.addEventListener("seeked", onActiveVideoRecovered);
        activeVideo.addEventListener("playing", onActiveVideoRecovered);
      }
      activeVideo.addEventListener("timeupdate", maybePreloadUpcomingChunks);
      activeVideo.addEventListener("progress", maybePreloadUpcomingChunks);
      if (mobileMp4Queue) {
        setFeedVideoPreloadPriority(
          false,
          activeVideo,
          "waiting-for-active-buffer-headroom",
        );
      }
      maybePreloadUpcomingChunks();

      return () => {
        disposed = true;
        cleanupListeners();
        if (mobileMp4Queue) {
          const currentActivePost = posts[activeIndexRef.current];
          const currentActiveVideo = currentActivePost
            ? videoRefs.current[getPostId(currentActivePost)]
            : null;
          setFeedVideoPreloadPriority(
            false,
            currentActiveVideo,
            "active-player-changed",
          );
        }
      };
    }, [feedPreloadPostIdsKey, activeIndex, activePostId, playingVideoPostId]);

    useEffect(() => {
      let cancelled = false;

      api.bookmarks
        .getMine()
        .then((response) => {
          if (cancelled) return;
          const savedIds = new Set(
            (Array.isArray(response?.posts) ? response.posts : [])
              .map((post) => getPostId(post))
              .filter((id) => id != null)
              .map(String),
          );

          setBookmarkedPosts((previous) => {
            const next = { ...previous };
            posts.forEach((post) => {
              const key = String(getPostId(post));
              if (!userChangedBookmarksRef.current.has(key)) {
                next[key] = savedIds.has(key);
              }
            });
            return next;
          });
        })
        .catch(() => {
          // Keep the viewer usable when the user is signed out.
        });

      return () => {
        cancelled = true;
      };
    }, [posts]);

    async function toggleBookmark(postId) {
      if (postId == null) return;
      const key = String(postId);
      if (bookmarkRequestsRef.current.has(key)) return;

      const wasBookmarked = Boolean(bookmarkedPosts[key]);
      bookmarkRequestsRef.current.add(key);
      userChangedBookmarksRef.current.add(key);
      setBookmarkedPosts((previous) => ({
        ...previous,
        [key]: !wasBookmarked,
      }));

      try {
        if (wasBookmarked) {
          await api.bookmarks.remove(postId);
        } else {
          await api.bookmarks.add(postId);
        }
      } catch (error) {
        setBookmarkedPosts((previous) => ({
          ...previous,
          [key]: wasBookmarked,
        }));
        userChangedBookmarksRef.current.delete(key);
        if (typeof window !== "undefined") {
          window.alert(error?.message || "Please sign in to save posts.");
        }
      } finally {
        bookmarkRequestsRef.current.delete(key);
      }
    }

    useEffect(() => {
      const video = videoRefs.current[getPostId(activePost)];
      if (!video) {
        setCurrentTime(0);
        setDuration(0);
        setSettingsOpen(false);
        return;
      }
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    }, [activePost]);
    // Restore saved likes from the backend when the tablet viewer opens.
    useEffect(() => {
      let cancelled = false;

      api.posts

        .getMyLikes()

        .then((response) => {
          if (cancelled) return;

          const postIds = Array.isArray(response?.postIds)
            ? response.postIds.map(String)
            : [];

          const restored = Object.fromEntries(postIds.map((id) => [id, true]));

          setLikedPosts((previous) => {
            const next = { ...restored, ...previous };

            userChangedLikesRef.current.forEach((id) => {
              if (Object.prototype.hasOwnProperty.call(previous, id)) {
                next[id] = previous[id];
              }
            });

            likedPostsRef.current = next;

            return next;
          });
        })

        .catch((error) => {
          console.error("Unable to load liked posts:", error.message);
        });

      return () => {
        cancelled = true;
      };
    }, []);
    // Keep the displayed counts in sync with the counts returned for each post.
    useEffect(() => {
      setLikeCounts((previous) => {
        let changed = false;

        const next = { ...previous };

        posts.forEach((post) => {
          const rawId = getPostId(post);

          if (rawId == null) return;

          const key = String(rawId);

          if (next[key] === undefined) {
            next[key] =
              Number(post.likesCount ?? post.likeCount ?? post.likes ?? 0) || 0;

            changed = true;
          }
        });
        // A new `posts` array may arrive on every parent render. Returning the// same state object when nothing changed prevents an update loop.
        const result = changed ? next : previous;

        likeCountsRef.current = result;

        confirmedLikeCountsRef.current = {
          ...confirmedLikeCountsRef.current,

          ...Object.fromEntries(
            Object.entries(result).filter(
              ([key]) => confirmedLikeCountsRef.current[key] === undefined,
            ),
          ),
        };

        return result;
      });
    }, [posts]);

    const commentsPostId = getPostId(commentsPost);
    // Show creator details whenever a new post becomes active, then hide them// after five seconds unless the viewer touches the video again.
    const revealDetails = useCallback(() => {
      setDetailsVisible(true);
      setPlaybackVisible(true);

      if (detailsTimerRef.current) window.clearTimeout(detailsTimerRef.current);
      if (playbackTimerRef.current)
        window.clearTimeout(playbackTimerRef.current);

      // Creator details disappear first; playback controls remain a little longer.
      detailsTimerRef.current = window.setTimeout(() => {
        setDetailsVisible(false);
        detailsTimerRef.current = null;
      }, 3000);

      playbackTimerRef.current = window.setTimeout(() => {
        setPlaybackVisible(false);
        playbackTimerRef.current = null;
      }, 7000);
    }, []);

    useEffect(() => {
      if (detailsTimerRef.current) window.clearTimeout(detailsTimerRef.current);
      if (playbackTimerRef.current)
        window.clearTimeout(playbackTimerRef.current);

      detailsTimerRef.current = window.setTimeout(() => {
        setDetailsVisible(false);
        detailsTimerRef.current = null;
      }, 3000);

      playbackTimerRef.current = window.setTimeout(() => {
        setPlaybackVisible(false);
        playbackTimerRef.current = null;
      }, 7000);

      return () => {
        if (detailsTimerRef.current) {
          window.clearTimeout(detailsTimerRef.current);
          detailsTimerRef.current = null;
        }
        if (playbackTimerRef.current) {
          window.clearTimeout(playbackTimerRef.current);
          playbackTimerRef.current = null;
        }
      };
    }, [activePostId]);
    // Seed comment counts from the feed, then poll the active/visible post so// comments made by other people update the icon without refreshing the page.
    // The feed count seed intentionally synchronizes incoming props into local count state.
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommentCounts((previous) => {
        let changed = false;

        const next = { ...previous };

        posts.forEach((post) => {
          const rawId = getPostId(post);

          if (rawId == null) return;

          const key = String(rawId);

          if (next[key] === undefined) {
            next[key] =
              Number(
                post.commentsCount ?? post.commentCount ?? post.comments ?? 0,
              ) || 0;

            changed = true;
          }
        });

        return changed ? next : previous;
      });
    }, [posts]);

    // Avoid polling full comment threads every three seconds while videos play.
    // Feed counts are seeded above; opening the comments panel loads the thread,
    // and submitComment updates the count immediately.

    useEffect(() => {
      if (!commentsPostId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setComments([]);

        setCommentsError("");

        setCommentsLoading(false);

        return;
      }

      let cancelled = false;

      setCommentsLoading(true);

      setCommentsError("");

      api.posts

        .getComments(commentsPostId)

        .then((result) => {
          if (!cancelled) {
            const fetchedComments = Array.isArray(result?.comments)
              ? result.comments
              : [];
            setComments(fetchedComments);
            const rawCount =
              result?.commentsCount ?? result?.count ?? result?.total;
            const count =
              Number.isFinite(Number(rawCount)) && rawCount != null
                ? Number(rawCount)
                : fetchedComments.length;
            setCommentCounts((previous) => ({
              ...previous,
              [String(commentsPostId)]: count,
            }));
          }
        })

        .catch((error) => {
          if (!cancelled) {
            setCommentsError(error?.message || "Unable to load comments.");
          }
        })

        .finally(() => {
          if (!cancelled) setCommentsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [commentsPostId]);

    async function submitComment(text) {
      const postId = getPostId(commentsPost);

      if (!postId) throw new Error("Could not identify this post.");
      // Show the comment immediately while the server saves it.
      const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const optimisticComment = {
        id: temporaryId,

        _id: temporaryId,

        text,

        creator: "You",

        createdAt: new Date().toISOString(),

        likesCount: 0,

        pending: true,
      };

      setComments((previous) => [optimisticComment, ...previous]);

      try {
        const result = await api.posts.addComment(postId, text);

        const savedComment =
          result?.comment ?? result?.data?.comment ?? result?.data;

        setCommentCounts((previous) => ({
          ...previous,

          [String(postId)]: (Number(previous[String(postId)]) || 0) + 1,
        }));

        if (savedComment && typeof savedComment === "object") {
          // Replace the temporary row with the canonical comment returned by the API.
          setComments((previous) => [
            savedComment,

            ...previous.filter(
              (comment) => String(comment._id ?? comment.id) !== temporaryId,
            ),
          ]);
        } else {
          // If the API does not return the created comment, refresh from the server.
          const refreshed = await api.posts.getComments(postId);

          setComments(
            Array.isArray(refreshed?.comments) ? refreshed.comments : [],
          );
        }
      } catch (error) {
        // Remove the optimistic row if saving failed so the UI stays truthful.
        setComments((previous) =>
          previous.filter(
            (comment) => String(comment._id ?? comment.id) !== temporaryId,
          ),
        );

        throw error;
      }
    }

    useEffect(() => {
      activeIndexRef.current = activeIndex;
    }, [activeIndex]);
    // Align before paint so the clicked post opens directly instead of briefly
    // showing the first post and visibly scrolling to the selection.
    tablet_useLayoutEffect(() => {
      const feed = feedRef.current;

      if (!feed || !posts.length || initialScrollDoneRef.current) return;

      const initialId = getPostId(initialPost);

      const index = posts.findIndex(
        (post) =>
          post === initialPost || String(getPostId(post)) === String(initialId),
      );

      const requestedIndex =
        Number.isInteger(initialPostIndex) && initialPostIndex >= 0
          ? Math.min(initialPostIndex, Math.max(posts.length - 1, 0))
          : 0;
      const resolvedIndex = index >= 0 ? index : requestedIndex;
      const targetPost = posts[resolvedIndex];
      const target = postRefs.current[getPostId(targetPost)];
      if (!target) return;

      initialScrollDoneRef.current = true;
      activeIndexRef.current = resolvedIndex;
      setActiveIndex(resolvedIndex);

      // Place the selected card instantly while scroll snapping is disabled.
      // Re-enabling snap after this synchronous layout update prevents an
      // animated journey from the first post to the clicked post.
      const feedTop = feed.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      feed.style.scrollBehavior = "auto";
      feed.style.scrollSnapType = "none";
      feed.scrollTop = Math.max(0, feed.scrollTop + targetTop - feedTop);
      lastFeedScrollTopRef.current = feed.scrollTop;
      setInitialPlacementReady(true);
    }, [initialPost, posts, initialPostIndex]);
    // Play only the active video; do not change the feed scroll position here.
    useEffect(() => {
      posts.forEach((post, index) => {
        const video = videoRefs.current[getPostId(post)];

        if (!video) return;

        if (index === activeIndex && !paused && !isPhotoPost(post)) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, [activeIndex, paused, posts]);

    useEffect(() => {
      const loveTimers = loveTimerRef.current;
      const playbackFeedbackTimer = playbackFeedbackTimerRef.current;

      return () => {
        if (tapTimerRef.current) {
          window.clearTimeout(tapTimerRef.current);
        }

        if (detailsTimerRef.current) {
          window.clearTimeout(detailsTimerRef.current);
        }

        if (scrollFrameRef.current) {
          cancelAnimationFrame(scrollFrameRef.current);
        }

        if (playbackFeedbackTimer) {
          window.clearTimeout(playbackFeedbackTimer);
        }

        Object.values(loveTimers).forEach((timer) => {
          window.clearTimeout(timer);
        });
      };
    }, []);
    // Update the active post after scrolling settles near a page boundary.
    const handleFeedScroll = useCallback(() => {
      // Any feed movement should reveal the creator details again.
      revealDetails();

      const feed = feedRef.current;

      if (!feed) return;

      if (scrollFrameRef.current) {
        cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollFrameRef.current = requestAnimationFrame(() => {
        const currentFeed = feedRef.current;

        if (!currentFeed || !currentFeed.clientHeight) return;

        const feedRect = currentFeed.getBoundingClientRect();
        const feedCenter = feedRect.top + currentFeed.clientHeight / 2;
        let nextIndex = activeIndexRef.current;
        let bestDistance = Number.POSITIVE_INFINITY;

        // Resolve the active card from its actual visible position instead of
        // dividing scrollTop by a viewport height. This stays correct when the
        // browser chrome/safe area changes height and supports both directions.
        posts.forEach((post, index) => {
          const element = postRefs.current[getPostId(post)];
          if (!element) return;
          const rect = element.getBoundingClientRect();
          const visibleHeight =
            Math.min(rect.bottom, feedRect.bottom) -
            Math.max(rect.top, feedRect.top);
          if (visibleHeight <= 0) return;
          const distance = Math.abs((rect.top + rect.bottom) / 2 - feedCenter);
          if (distance < bestDistance) {
            bestDistance = distance;
            nextIndex = index;
          }
        });

        const scrollDelta =
          currentFeed.scrollTop - lastFeedScrollTopRef.current;
        const scrollDirection = scrollDelta > 1 ? 1 : scrollDelta < -1 ? -1 : 0;

        // On mobile/tablet, keep media-segment downloads tied to a real swipe
        // and wait until the target slide is at least 15% visible. Auto uses
        // 480p in Data Saver/weak mobile conditions and up to 720p on normal
        // mobile connections; fast desktop connections may use up to 1080p.
        if (scrollDirection !== 0) {
          let intentIndex = activeIndexRef.current + scrollDirection;
          let intentPost = posts[intentIndex];
          let intentPostId = intentPost ? String(getPostId(intentPost)) : "";
          let intentElement = intentPostId
            ? postRefs.current[intentPostId]
            : null;
          let visibleRatio = 0;

          const getVisibleRatio = (element) => {
            if (!element) return 0;
            const rect = element.getBoundingClientRect();
            const visibleHeight =
              Math.min(rect.bottom, feedRect.bottom) -
              Math.max(rect.top, feedRect.top);
            return Math.max(0, visibleHeight) / Math.max(1, rect.height);
          };

          visibleRatio = getVisibleRatio(intentElement);
          // If a fast swipe skips past the immediately adjacent card, warm the
          // post that is actually closest to the viewer instead of an unseen
          // intermediate item.
          if (visibleRatio < 0.08 && nextIndex !== activeIndexRef.current) {
            intentIndex = nextIndex;
            intentPost = posts[intentIndex];
            intentPostId = intentPost ? String(getPostId(intentPost)) : "";
            intentElement = intentPostId
              ? postRefs.current[intentPostId]
              : null;
            visibleRatio = getVisibleRatio(intentElement);
          }

          if (
            intentPost &&
            intentElement &&
            intentIndex !== activeIndexRef.current &&
            visibleRatio >= 0.08 &&
            !isPhotoPost(intentPost) &&
            !scrollIntentPrewarmedPostIdsRef.current.has(intentPostId)
          ) {
            const intentUrl = getOriginalVideoUrl(intentPost);
            if (getCloudinaryHlsUrl(intentUrl)) {
              const intentNetworkProfile = getNetworkPlaybackProfile();
              const mobileMp4Intent = !intentNetworkProfile.desktopPlayback;
              const intentVideoElement = mobileMp4Intent
                ? videoRefs.current[intentPostId]
                : null;
              let mobileIntentAllowed = true;
              let activeBufferAheadForIntent = 0;
              if (mobileMp4Intent) {
                const currentActivePost = posts[activeIndexRef.current];
                const currentActiveVideo = currentActivePost
                  ? videoRefs.current[getPostId(currentActivePost)]
                  : null;
                const activeBufferAhead = currentActiveVideo
                  ? getSpotliBufferedAheadSeconds(currentActiveVideo)
                  : 0;
                activeBufferAheadForIntent = activeBufferAhead;
                const intentPolicy =
                  getUpcomingVideoChunkPreloadPolicy(intentNetworkProfile);
                const intentOptimizedSource =
                  getOptimizedPlaybackUrl(intentUrl);
                const existingIntentPreload = intentVideoElement
                  ? feedVideoPreloadStates.get(intentVideoElement)
                  : null;
                const canContinueExistingPreload =
                  feedVideoPreloadsAllowed &&
                  existingIntentPreload?.sourceUrl === intentOptimizedSource &&
                  activeBufferAhead >=
                    (intentPolicy.yieldBelowBufferedAheadSeconds || 2);
                mobileIntentAllowed = Boolean(
                  currentActiveVideo &&
                  !currentActiveVideo.paused &&
                  !currentActiveVideo.ended &&
                  (activeBufferAhead >=
                    intentPolicy.minimumBufferedAheadSeconds ||
                    canContinueExistingPreload),
                );
                setFeedVideoPreloadPriority(
                  mobileIntentAllowed,
                  currentActiveVideo,
                  mobileIntentAllowed
                    ? "swipe-intent-with-active-buffer-headroom"
                    : "swipe-intent-deferred-for-active-buffer",
                );
              }

              if (mobileIntentAllowed) {
                scrollIntentPrewarmedPostIdsRef.current.add(intentPostId);
                console.info(
                  `[Spotli playback] Swipe-intent ${mobileMp4Intent ? "mobile MP4 frame" : "HLS segment"} warmup started`,
                  {
                    source: "mobile-scroll-intent",
                    postId: intentPostId,
                    asset:
                      getSpotliCloudinaryAssetParts(intentUrl)
                        ?.assetPathWithoutExtension || null,
                    visiblePercent: Math.round(visibleRatio * 100),
                    scrollDeltaPx: Math.round(scrollDelta),
                    dataSaver: intentNetworkProfile.dataSaver,
                    network: intentNetworkProfile.effectiveType,
                    reusesFeedElement: Boolean(intentVideoElement),
                  },
                );
                Promise.resolve(
                  preloadNextVideoPlayback(intentUrl, {
                    videoElement: intentVideoElement,
                    postId: intentPostId,
                    priority: "swipe-intent-next-video",
                    partialBytes:
                      getUpcomingVideoChunkPreloadPolicy().segmentBytes,
                    fallbackMp4OnWarmFailure: false,
                  }),
                )
                  .then((prepared) => {
                    if (prepared !== true) {
                      scrollIntentPrewarmedPostIdsRef.current.delete(
                        intentPostId,
                      );
                    }
                  })
                  .catch(() => {
                    scrollIntentPrewarmedPostIdsRef.current.delete(
                      intentPostId,
                    );
                  });
              } else {
                // Scroll events can fire repeatedly while the same card is
                // entering view. Throttle this diagnostic per post so it does
                // not flood the console while the buffer recovers.
                const deferredLogNow = Date.now();
                const lastDeferredLogAt =
                  scrollIntentDeferredLogAtRef.current.get(intentPostId) || 0;
                if (deferredLogNow - lastDeferredLogAt >= 1500) {
                  scrollIntentDeferredLogAtRef.current.set(
                    intentPostId,
                    deferredLogNow,
                  );
                  if (scrollIntentDeferredLogAtRef.current.size > 100) {
                    const oldestPostId = scrollIntentDeferredLogAtRef.current
                      .keys()
                      .next().value;
                    scrollIntentDeferredLogAtRef.current.delete(oldestPostId);
                  }
                  console.info(
                    "[Spotli playback] Deferring swipe-intent MP4 preload until active buffer is healthy",
                    {
                      postId: intentPostId,
                      activeBufferedAheadSeconds:
                        Math.round(activeBufferAheadForIntent * 100) / 100,
                      requiredBufferedAheadSeconds:
                        getUpcomingVideoChunkPreloadPolicy(intentNetworkProfile)
                          .minimumBufferedAheadSeconds,
                      resumePreloadAtSeconds:
                        getUpcomingVideoChunkPreloadPolicy(intentNetworkProfile)
                          .minimumBufferedAheadSeconds,
                    },
                  );
                }
              }
            }
          }
        }

        lastFeedScrollTopRef.current = currentFeed.scrollTop;

        if (nextIndex !== activeIndexRef.current) {
          activeIndexRef.current = nextIndex;

          setActiveIndex(nextIndex);

          setPaused(false);
        }
      });
    }, [posts, revealDetails]);

    function navigateFeedBy(direction) {
      const feed = feedRef.current;
      const targetIndex = activeIndexRef.current + direction;
      if (!feed || targetIndex < 0 || targetIndex >= posts.length) return;

      const targetPost = posts[targetIndex];
      const targetElement = postRefs.current[getPostId(targetPost)];
      if (!targetElement) return;

      const feedTop = feed.getBoundingClientRect().top;
      const targetTop = targetElement.getBoundingClientRect().top;
      feed.scrollTo({
        top: Math.max(0, feed.scrollTop + targetTop - feedTop),
        behavior: "smooth",
      });
    }

    function togglePlayback(postId) {
      const video = videoRefs.current[postId];

      if (!video) return;

      const willPlay = video.paused;

      if (willPlay) {
        video.play().catch(() => {});
        setPaused(false);
      } else {
        video.pause();
        setPaused(true);
      }

      setPlaybackFeedback({
        postId: String(postId),
        action: willPlay ? "play" : "pause",
        key: ++playbackFeedbackKeyRef.current,
      });

      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
      }

      playbackFeedbackTimerRef.current = window.setTimeout(() => {
        setPlaybackFeedback(null);
        playbackFeedbackTimerRef.current = null;
      }, 850);
    }

    async function toggleLike(postId) {
      const key = String(postId);

      const post = posts.find((item) => String(getPostId(item)) === key);

      if (!post || !key || key === "undefined" || key === "null") return;

      userChangedLikesRef.current.add(key);
      // Read the latest intent, not a possibly stale render closure.
      const wasLiked = Boolean(likedPostsRef.current[key] ?? likedPosts[key]);

      const nextLiked = !wasLiked;

      likedPostsRef.current = { ...likedPostsRef.current, [key]: nextLiked };

      setLikedPosts((previous) => ({ ...previous, [key]: nextLiked }));

      const rawPostCount = [post.likesCount, post.likeCount, post.likes]

        .map(Number)

        .find((value) => Number.isFinite(value) && value >= 0);

      const displayedCount = likeCountsRef.current[key];

      const currentCount = Number.isFinite(Number(displayedCount))
        ? Number(displayedCount)
        : (rawPostCount ?? 0);

      const nextCount = Math.max(0, currentCount + (nextLiked ? 1 : -1));

      likeCountsRef.current = { ...likeCountsRef.current, [key]: nextCount };

      setLikeCounts((previous) => ({ ...previous, [key]: nextCount }));
      // One request loop per post: rapid taps update the desired state immediately,// and the loop serializes API changes until the server matches that state.
      if (likeRequestsRef.current.has(key)) return;

      likeRequestsRef.current.add(key);

      let serverLiked = wasLiked;

      try {
        while (serverLiked !== Boolean(likedPostsRef.current[key])) {
          const desiredLiked = Boolean(likedPostsRef.current[key]);

          const response = desiredLiked
            ? await api.posts.like(key)
            : await api.posts.unlike(key);

          serverLiked = desiredLiked;

          if (
            response?.likesCount !== undefined &&
            response?.likesCount !== null
          ) {
            const serverCount = Number(response.likesCount);
            // Only use a server count when it reflects the latest completed action.
            if (Number.isFinite(serverCount) && serverCount >= 0) {
              if (serverLiked === Boolean(likedPostsRef.current[key])) {
                likeCountsRef.current = {
                  ...likeCountsRef.current,

                  [key]: serverCount,
                };

                confirmedLikeCountsRef.current = {
                  ...confirmedLikeCountsRef.current,

                  [key]: serverCount,
                };

                setLikeCounts((previous) => ({
                  ...previous,

                  [key]: serverCount,
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error("Unable to update like:", error?.message || error);
        // Restore the server-confirmed state after a failed request.
        likedPostsRef.current = {
          ...likedPostsRef.current,
          [key]: serverLiked,
        };

        setLikedPosts((previous) => ({ ...previous, [key]: serverLiked }));

        const confirmedCount = confirmedLikeCountsRef.current[key];

        const fallbackCount = Number.isFinite(Number(confirmedCount))
          ? Number(confirmedCount)
          : (rawPostCount ?? 0);

        likeCountsRef.current = {
          ...likeCountsRef.current,

          [key]: fallbackCount,
        };

        setLikeCounts((previous) => ({ ...previous, [key]: fallbackCount }));
      } finally {
        likeRequestsRef.current.delete(key);
      }
    }

    function toggleFollow(postId) {
      setFollowedCreators((previous) => ({
        ...previous,

        [postId]: !previous[postId],
      }));
    }

    function handleVideoMetadata(postId, event) {
      const video = event.currentTarget;

      setVideoOrientations((previous) => ({
        ...previous,

        [postId]:
          video.videoWidth > video.videoHeight ? "landscape" : "portrait",
      }));
    }

    function handleTimeUpdate(postId) {
      const video = videoRefs.current[postId];

      if (!video?.duration) return;

      setProgress((previous) => ({
        ...previous,

        [postId]: (video.currentTime / video.duration) * 100,
      }));
    }

    function formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
      const minutes = Math.floor(seconds / 60);
      const remaining = Math.floor(seconds % 60);
      return `${minutes}:${String(remaining).padStart(2, "0")}`;
    }

    function seekVideo(postId, value) {
      const video = videoRefs.current[postId];
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Number(value);
      setCurrentTime(video.currentTime);
      setProgress((previous) => ({
        ...previous,
        [postId]: video.duration
          ? (video.currentTime / video.duration) * 100
          : 0,
      }));
    }

    function toggleMute(postId) {
      const nextMuted = !muted;
      setMuted(nextMuted);
      Object.values(videoRefs.current).forEach((video) => {
        if (video) video.muted = nextMuted;
      });
      const video = videoRefs.current[postId];
      if (video) video.muted = nextMuted;
    }

    function toggleCaptions(postId) {
      const nextEnabled = !captionsEnabled;
      setCaptionsEnabled(nextEnabled);
      const video = videoRefs.current[postId];
      if (!video?.textTracks) return;
      Array.from(video.textTracks).forEach((track) => {
        track.mode = nextEnabled ? "showing" : "hidden";
      });
    }

    function changePlaybackRate(postId, rate) {
      setPlaybackRate(rate);
      Object.values(videoRefs.current).forEach((video) => {
        if (video) video.playbackRate = rate;
      });
      const video = videoRefs.current[postId];
      if (video) video.playbackRate = rate;
      setSettingsOpen(false);
    }

    function showLoveAnimation(postId) {
      if (
        !(likedPostsRef.current[String(postId)] ?? likedPosts[String(postId)])
      ) {
        void toggleLike(postId);
      }

      setLoveAnimations((previous) => ({
        ...previous,

        [postId]: Date.now(),
      }));

      if (loveTimerRef.current[postId]) {
        window.clearTimeout(loveTimerRef.current[postId]);
      }

      loveTimerRef.current[postId] = window.setTimeout(() => {
        setLoveAnimations((previous) => {
          const next = { ...previous };

          delete next[postId];

          return next;
        });

        delete loveTimerRef.current[postId];
      }, 750);
    }

    function handleVideoTap(postId) {
      if (String(postId) === String(activePostId)) revealDetails();

      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();

      const previousTap = lastTapRef.current;

      if (previousTap.postId === postId && now - previousTap.time < 280) {
        if (tapTimerRef.current) {
          window.clearTimeout(tapTimerRef.current);

          tapTimerRef.current = null;
        }

        lastTapRef.current = { time: 0, postId: null };

        showLoveAnimation(postId);

        return;
      }

      lastTapRef.current = { time: now, postId };

      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      tapTimerRef.current = window.setTimeout(() => {
        const post = posts.find((item) => getPostId(item) === postId);

        if (post && !isPhotoPost(post)) {
          togglePlayback(postId);
        }

        tapTimerRef.current = null;
      }, 280);
    }

    function handlePhotoTap(postId) {
      if (String(postId) === String(activePostId)) revealDetails();

      // eslint-disable-next-line react-hooks/purity
      const now = Date.now();

      const previousTap = lastTapRef.current;

      if (previousTap.postId === postId && now - previousTap.time < 280) {
        if (tapTimerRef.current) {
          window.clearTimeout(tapTimerRef.current);

          tapTimerRef.current = null;
        }

        lastTapRef.current = { time: 0, postId: null };

        showLoveAnimation(postId);

        return;
      }

      lastTapRef.current = { time: now, postId };

      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
      }, 280);
    }

    async function sharePost(post) {
      const shareData = {
        title: post.caption || "Spotli post",

        text: `${post.caption || ""} — ${getCreatorName(post)} on Spotli`,

        url: window.location.href,
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(
            `${shareData.text}\n${shareData.url}`,
          );
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Unable to share post:", error);
        }
      }
    }

    function openComments(post) {
      setCommentsPost(post);
    }

    function openPostMenu(post) {
      const postId = String(getPostId(post) || "");
      if (!postId) return;
      setOpenPostOptionsId((current) => (current === postId ? null : postId));
    }

    async function deletePostFromViewer(post) {
      if (
        !isPostOwnedBy(post, currentUserId) ||
        typeof onDeletePost !== "function"
      )
        return;
      const postId = String(getPostId(post) || "");
      if (!postId) return;
      setOpenPostOptionsId(null);
      const confirmed = window.confirm(
        "Delete this post permanently? Its likes, comments, and saved copies will also be removed.",
      );
      if (!confirmed) return;
      try {
        await onDeletePost(post);
      } catch (error) {
        window.alert(error?.message || "Unable to delete this post.");
      }
    }

    if (!posts.length || !activePost) return null;

    return (
      <div className="fixed inset-0 z-100 block overflow-hidden bg-[#080808] text-white lg:inset-y-0 lg:left-16 lg:right-0 lg:bg-[#101214]">
        {dataSaverEnabled && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed left-1/2 top-4 z-[129] -translate-x-1/2 rounded-full border border-white/15 bg-[#171717]/90 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md"
          >
            Data Saver ON - You are saving data
          </div>
        )}
        {networkQualityNotice && (
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none fixed left-1/2 ${dataSaverEnabled ? "top-16" : "top-4"} z-[130] flex w-max max-w-[min(92vw,440px)] -translate-x-1/2 items-start gap-2 rounded-xl border border-amber-300/30 bg-[#171717]/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-md`}
          >
            <span aria-hidden="true" className="mt-0.5 text-amber-300">
              ⚠
            </span>
            <span>{networkQualityNotice}</span>
          </div>
        )}

        <div
          aria-label="Spotli"
          className="fixed left-0 top-0 z-[115] hidden h-16 w-16 items-center justify-center bg-[#0f0f0f] text-[25px] font-black tracking-tight text-white lg:flex"
        >
          S<span className="text-[#FF2D4A]">.</span>
        </div>

        <main
          ref={feedRef}
          onScroll={handleFeedScroll}
          onTouchStart={revealDetails}
          onTouchMove={revealDetails}
          onWheel={revealDetails}
          className="h-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollBehavior: "auto",
            scrollSnapType: initialPlacementReady ? "y mandatory" : "none",
          }}
        >
          {posts.map((post, index) => {
            const postId = getPostId(post);

            const isActive = index === activeIndex;

            const photoPost = isPhotoPost(post);

            const images = getPostImages(post);

            const photoIndex = Math.min(
              photoIndexes[postId] || 0,

              Math.max(images.length - 1, 0),
            );

            const currentImage = images[photoIndex] || "";

            const videoUrl = getVideoUrl(post);
            const originalVideoUrl = getOriginalVideoUrl(post);
            const directMp4SourceUrl = getDirectSpotliMp4Url(originalVideoUrl);

            // Let the stream controller attach the active Cloudinary source
            // after it chooses HLS or the original MP4 fallback. Inactive cards
            // keep a stable MP4 src only for fallback preloading/reuse.
            // Until real video dimensions are available, contain the frame so
            // landscape content is never cropped while HLS initializes.
            const orientation = videoOrientations[postId] || "unknown";

            const orientationKnown = orientation !== "unknown";

            const isLandscape = orientation === "landscape";

            const explicitThumbnail = resolveMediaUrl(
              getExplicitPostThumbnail(post),
            );
            // For videos, don't use mediaUrls[0] as a poster: older posts often
            // put the actual MP4 there, which the browser cannot render as an image.
            const thumbnail = photoPost
              ? currentImage || explicitThumbnail
              : explicitThumbnail ||
                getCloudinaryVideoThumbnailUrl(getOriginalVideoUrl(post));

            const profilePicture = getAvatarUrl(post);

            const creatorName = getCreatorName(post);

            const creatorHandle = getCreatorHandle(post);

            return (
              <section
                key={postId}
                ref={(node) => {
                  postRefs.current[postId] = node;
                }}
                className="relative h-dvh min-h-dvh w-full snap-start snap-always overflow-hidden bg-[#080808]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center blur-2xl lg:hidden"
                  style={{
                    backgroundImage: thumbnail
                      ? `url("${thumbnail}")`
                      : undefined,
                  }}
                />

                <div className="pointer-events-none absolute inset-0 bg-black/55 lg:bg-[#101214]" />

                <div
                  className={`absolute overflow-hidden bg-black shadow-2xl ${
                    isLandscape && !photoPost
                      ? "left-1/2 top-1/2 h-[min(100vh,56.25vw)] w-[min(100vw,177.7778vh)] -translate-x-1/2 -translate-y-1/2 rounded-3xl"
                      : "inset-0 h-full w-full"
                  } lg:left-[calc(50%_-_42px)] lg:top-1/2 lg:right-auto lg:bottom-auto ${
                    isLandscape && !photoPost
                      ? "lg:aspect-video lg:h-auto lg:max-h-[80dvh] lg:w-[min(68vw,142.2222dvh,1100px)]"
                      : "lg:h-[94dvh] lg:w-[min(430px,52.875dvh)]"
                  } lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:ring-1 lg:ring-white/10`}
                >
                  {photoPost ? (
                    <div className="relative h-full w-full">
                      {images.length > 0 ? (
                        <div
                          className="h-full w-full overflow-hidden"
                          style={{ touchAction: "pan-x pan-y" }}
                          onClick={() => handlePhotoTap(postId)}
                        >
                          <div
                            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none [&::-webkit-scrollbar]:hidden"
                            style={{
                              scrollSnapType: "x mandatory",

                              WebkitOverflowScrolling: "touch",
                            }}
                            onScroll={(event) => {
                              const container = event.currentTarget;

                              const width = container.clientWidth;

                              if (!width) return;

                              const nextIndex = Math.round(
                                container.scrollLeft / width,
                              );

                              setPhotoIndexes((previous) => {
                                if (previous[postId] === nextIndex) {
                                  return previous;
                                }

                                return {
                                  ...previous,

                                  [postId]: nextIndex,
                                };
                              });
                            }}
                          >
                            {images.map((image, imageIndex) => (
                              <div
                                key={`${postId}-${imageIndex}`}
                                className="h-full w-full min-w-full shrink-0 snap-start snap-always overflow-hidden"
                              >
                                <img
                                  src={image}
                                  alt={`${post.caption || "Post photo"} — image ${imageIndex + 1}`}
                                  draggable={false}
                                  loading={imageIndex === 0 ? "eager" : "lazy"}
                                  className="pointer-events-none h-full w-full select-none object-contain"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
                          Image unavailable
                        </div>
                      )}

                      {images.length > 1 && (
                        <>
                          <div className="pointer-events-none absolute right-4 top-20 z-20 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                            {photoIndex + 1} / {images.length}
                          </div>

                          <div className="pointer-events-none absolute bottom-32 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
                            {images.map((image, imageIndex) => (
                              <span
                                key={`${postId}-indicator-${imageIndex}`}
                                className={`h-1.5 rounded-full transition-all ${
                                  imageIndex === photoIndex
                                    ? "w-5 bg-white"
                                    : "w-1.5 bg-white/50"
                                }`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <video
                        ref={(node) => {
                          videoRefs.current[postId] = node;
                          if (node) node.dataset.postId = String(postId);
                        }}
                        src={
                          directMp4SourceUrl
                            ? getOptimizedPlaybackUrl(originalVideoUrl) ||
                              directMp4SourceUrl
                            : getCloudinaryHlsUrl(originalVideoUrl)
                              ? undefined
                              : videoUrl || DEMO_VIDEO
                        }
                        poster={thumbnail || undefined}
                        autoPlay={
                          isActive &&
                          !paused &&
                          !getCloudinaryHlsUrl(originalVideoUrl)
                        }
                        controls={false}
                        muted
                        loop
                        playsInline
                        preload={
                          getCloudinaryHlsUrl(originalVideoUrl)
                            ? "none"
                            : isActive
                              ? "auto"
                              : "none"
                        }
                        onLoadedMetadata={(event) => {
                          handleVideoMetadata(postId, event);
                          if (isActive) {
                            setCurrentTime(
                              event.currentTarget.currentTime || 0,
                            );
                            setDuration(
                              Number.isFinite(event.currentTarget.duration)
                                ? event.currentTarget.duration
                                : 0,
                            );
                          }
                        }}
                        onTimeUpdate={(event) => {
                          handleTimeUpdate(postId);
                          if (isActive)
                            setCurrentTime(
                              event.currentTarget.currentTime || 0,
                            );
                        }}
                        onDurationChange={(event) => {
                          if (isActive)
                            setDuration(
                              Number.isFinite(event.currentTarget.duration)
                                ? event.currentTarget.duration
                                : 0,
                            );
                        }}
                        onClick={() => handleVideoTap(postId)}
                        onLoadedData={(event) => {
                          // Reveal the first decoded video frame as soon as it exists,
                          // instead of waiting for the later `playing` event. This
                          // avoids leaving the thumbnail over a frame that's already ready.
                          if (isActive && !paused) {
                            setPlayingVideoPostId(String(postId));
                          }
                        }}
                        onPlaying={() => setPlayingVideoPostId(String(postId))}
                        className={`h-full w-full ${
                          isLandscape || !orientationKnown
                            ? "object-contain"
                            : "object-cover"
                        }`}
                        style={{
                          filter:
                            "saturate(1.08) contrast(1.035) brightness(1.01)",
                        }}
                      />
                      {thumbnail &&
                        !isActive &&
                        String(playingVideoPostId) !== String(postId) && (
                          <img
                            src={thumbnail}
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            loading={isActive ? "eager" : "lazy"}
                            fetchPriority={isActive ? "high" : "low"}
                            decoding="async"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                            className={`pointer-events-none absolute inset-0 z-10 h-full w-full ${
                              isLandscape ? "object-contain" : "object-cover"
                            }`}
                          />
                        )}
                    </>
                  )}

                  {playbackFeedback?.postId === String(postId) && isActive && (
                    <div
                      key={playbackFeedback.key}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
                    >
                      <span className="grid h-20 w-20 place-items-center rounded-full bg-black/45 text-white shadow-xl">
                        {playbackFeedback.action === "play" ? (
                          <Play size={38} fill="currentColor" />
                        ) : (
                          <Pause size={38} fill="currentColor" />
                        )}
                      </span>
                    </div>
                  )}

                  {loveAnimations[postId] && (
                    <div
                      key={loveAnimations[postId]}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
                    >
                      <Heart
                        size={108}
                        fill="#FF2D4A"
                        color="#FF2D4A"
                        strokeWidth={1.5}
                        className="spotli-love-pop drop-shadow-2xl"
                      />
                    </div>
                  )}
                </div>

                {!photoPost && isActive && playbackVisible && (
                  <div
                    className="absolute inset-x-0 bottom-0 z-60 w-full bg-transparent px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 text-white transition-opacity duration-300 lg:bottom-3 lg:left-auto lg:right-3 lg:flex lg:w-auto lg:justify-end lg:px-0 lg:pb-0"
                    onClick={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="flex w-full items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => togglePlayback(postId)}
                        aria-label={paused ? "Play video" : "Pause video"}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
                      >
                        {paused ? (
                          <Play size={17} fill="currentColor" />
                        ) : (
                          <Pause size={17} />
                        )}
                      </button>
                      <span className="shrink-0 tabular-nums text-[10px] sm:text-xs lg:hidden">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleMute(postId)}
                        aria-label={muted ? "Unmute video" : "Mute video"}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:h-10 lg:w-10 lg:rounded-full lg:bg-black/50"
                      >
                        {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCaptions(postId)}
                        aria-label={
                          captionsEnabled
                            ? "Turn captions off"
                            : "Turn captions on"
                        }
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden ${captionsEnabled ? "bg-[#FF2D4A]/15 text-[#FF2D4A]" : "text-white hover:bg-white/10"}`}
                      >
                        <Captions size={17} />
                      </button>
                      <div className="relative shrink-0 lg:hidden">
                        <button
                          type="button"
                          onClick={() => setSettingsOpen((open) => !open)}
                          aria-label="Playback settings"
                          className="grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <Settings size={17} />
                        </button>
                        {settingsOpen && (
                          <div className="absolute bottom-10 right-0 z-70 max-h-72 min-w-40 max-w-48 overflow-y-auto rounded-lg bg-black/95 p-2 text-white shadow-xl">
                            <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                              Playback speed
                            </p>
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => changePlaybackRate(postId, rate)}
                                className={`block w-full rounded px-3 py-2 text-left text-xs ${playbackRate === rate ? "text-[#FF2D4A]" : "text-white"}`}
                              >
                                {rate === 1 ? "Normal" : `${rate}x`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const video = videoRefs.current[postId];
                          if (!video) return;
                          if (document.fullscreenElement)
                            document.exitFullscreen?.();
                          else video.requestFullscreen?.();
                        }}
                        aria-label="Fullscreen video"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
                      >
                        <Maximize size={17} />
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step="0.1"
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(event) =>
                        seekVideo(postId, event.target.value)
                      }
                      aria-label="Seek video"
                      className="mt-1 block h-7 w-full cursor-pointer touch-pan-x accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden"
                    />
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-linear-to-b from-black/70 to-transparent" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-linear-to-t from-black/90 via-black/35 to-transparent" />

                <header className="absolute left-4 right-4 top-4 z-40 flex items-center gap-3 lg:hidden">
                  <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to home"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/35 transition hover:bg-black/60"
                  >
                    <ArrowLeft size={21} />
                  </button>

                  <span className="text-lg font-extrabold tracking-tight">
                    Spotli<span className="text-[#FF2D4A]">.</span>
                  </span>
                </header>

                <aside
                  className={`absolute bottom-32 right-2 z-40 flex flex-col items-center gap-3 ${
                    isLandscape && !photoPost
                      ? "lg:bottom-auto lg:left-[calc(50%_-_42px_+_min(34vw,71.1111dvh,550px)_+_16px)] lg:right-auto lg:top-1/2 lg:-translate-y-1/2 lg:gap-2"
                      : "lg:bottom-6 lg:left-[calc(50%_+_193px)] lg:right-auto lg:top-auto lg:translate-y-0 lg:gap-2"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleLike(postId)}
                    aria-label={
                      likedPosts[postId] ? "Unlike post" : "Like post"
                    }
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5 lg:order-1"
                  >
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur-sm ${
                        likedPosts[postId] ? "text-[#FF2D4A]" : "text-white"
                      }`}
                    >
                      <Heart
                        size={27}
                        fill={likedPosts[postId] ? "currentColor" : "none"}
                      />
                    </span>

                    <span className="text-[11px] font-semibold">
                      {formatCount(
                        likeCounts[String(postId)] ??
                          Number(
                            post.likesCount ??
                              post.likeCount ??
                              post.likes ??
                              0,
                          ),
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openComments(post)}
                    aria-label="Comments"
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5 lg:order-2"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <MessageCircle size={27} />
                    </span>

                    <span className="text-[11px] font-semibold">
                      {formatCount(
                        commentCounts[String(getPostId(post))] ??
                          post.commentsCount ??
                          post.commentCount ??
                          post.comments ??
                          0,
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sharePost(post)}
                    aria-label="Share post"
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5 lg:order-3"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <Share2 size={20} />
                    </span>

                    <span className="text-[11px] font-semibold lg:hidden">
                      {formatCount(post.shares || 0)}
                    </span>
                  </button>

                  <div className="relative lg:order-5">
                    <button
                      type="button"
                      onClick={() => openPostMenu(post)}
                      aria-label="More post options"
                      aria-expanded={openPostOptionsId === String(postId)}
                      className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                        <MoreVertical size={20} />
                      </span>
                    </button>
                    {openPostOptionsId === String(postId) && (
                      <div className="absolute right-12 top-0 z-[160] min-w-40 rounded-xl border border-white/10 bg-[#171717] p-1.5 text-white shadow-2xl">
                        {isPostOwnedBy(post, currentUserId) ? (
                          <button
                            type="button"
                            onClick={() => void deletePostFromViewer(post)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-300 transition hover:bg-white/10"
                          >
                            <Trash2 size={15} /> Delete post
                          </button>
                        ) : (
                          <p className="px-3 py-2 text-xs text-white/60">
                            Only the creator can delete this post.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleBookmark(postId)}
                    aria-label={
                      bookmarkedPosts[String(postId)]
                        ? "Remove bookmark"
                        : "Bookmark post"
                    }
                    aria-pressed={Boolean(bookmarkedPosts[String(postId)])}
                    title={
                      bookmarkedPosts[String(postId)]
                        ? "Remove from saved posts"
                        : "Save post"
                    }
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5 lg:order-4"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <Bookmark
                        size={20}
                        fill={
                          bookmarkedPosts[String(postId)]
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </span>
                    <span className="text-[10px] font-semibold lg:hidden">
                      Save
                    </span>
                  </button>

                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt={`${creatorName}'s profile`}
                      className="order-6 mt-1 hidden h-8 w-8 rounded-lg border border-white/80 object-cover lg:block"
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="order-6 mt-1 hidden h-8 w-8 place-items-center rounded-lg border border-white/80 bg-white/15 text-xs font-bold lg:grid">
                      {(creatorName || "S").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </aside>

                <div
                  className={`absolute bottom-24 left-5 right-28 z-30 max-w-4xl transition-opacity duration-300 lg:bottom-8 lg:left-[clamp(110px,9.5vw,190px)] lg:right-auto lg:max-w-[320px] ${
                    isActive && detailsVisible
                      ? "opacity-100"
                      : "pointer-events-none opacity-0"
                  }`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    {profilePicture ? (
                      <img
                        src={profilePicture}
                        alt={`${creatorName}'s profile`}
                        onError={(event) => {
                          event.currentTarget.onerror = null;

                          event.currentTarget.style.display = "none";
                        }}
                        className="h-10 w-10 shrink-0 rounded-full border border-white/70 object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 bg-white/15 text-sm font-bold">
                        {creatorName

                          .split(/\s+/)

                          .filter(Boolean)

                          .slice(0, 2)

                          .map((part) => part[0])

                          .join("")

                          .toUpperCase() || "S"}
                      </span>
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {creatorName}
                      </p>

                      <p className="truncate text-xs text-white/70">
                        {creatorHandle}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleFollow(postId)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        followedCreators[postId]
                          ? "border-white/30 bg-white/15"
                          : "border-white/80 bg-black/15"
                      }`}
                    >
                      {followedCreators[postId] ? "Following" : "Follow"}
                    </button>
                  </div>

                  {post.caption && (
                    <p className="whitespace-pre-wrap text-lg leading-relaxed">
                      <MentionText
                        text={post.caption}
                        mentions={post.mentions}
                      />
                    </p>
                  )}

                  {post.location && (
                    <p className="mt-2 text-xs text-white/70">
                      {post.location}
                    </p>
                  )}
                </div>
                {isActive && posts.length > 1 && (
                  <div className="absolute right-12 top-1/2 z-50 hidden -translate-y-1/2 flex-col gap-4 lg:flex">
                    <button
                      type="button"
                      onClick={() => navigateFeedBy(-1)}
                      disabled={activeIndex <= 0}
                      aria-label="Previous video"
                      className="grid h-14 w-14 place-items-center rounded-full bg-[#25272a] text-white shadow-lg transition hover:bg-[#34373b] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronUp size={30} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateFeedBy(1)}
                      disabled={activeIndex >= posts.length - 1}
                      aria-label="Next video"
                      className="grid h-14 w-14 place-items-center rounded-full bg-[#25272a] text-white shadow-lg transition hover:bg-[#34373b] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      <ChevronDown size={30} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </main>

        {commentsPost && (
          <>
            <button
              type="button"
              aria-label="Close comments"
              onClick={() => setCommentsPost(null)}
              className="fixed inset-0 z-99 bg-black/45"
            />

            <aside
              className="fixed right-0 top-0 z-100 h-dvh max-h-dvh overflow-hidden border-l border-black/10 bg-white shadow-2xl"
              style={{ width: "clamp(300px, 42vw, 420px)" }}
            >
              <CommentSection
                post={commentsPost}
                comments={comments}
                loading={commentsLoading}
                error={commentsError}
                onSubmit={submitComment}
                onClose={() => setCommentsPost(null)}
                variant="panel"
              />
            </aside>
          </>
        )}
      </div>
    );
  }

  return TabletVideoViewer;
}
const TabletViewerImplementation = createTabletViewerImplementation();

/**
 * Reuse the existing tablet viewer for desktop. The existing mobile/tablet
 * responsive styling remains the default below the desktop breakpoint.
 */
export default function VideoViewer(props) {
  return <TabletViewerImplementation {...props} />;
}
