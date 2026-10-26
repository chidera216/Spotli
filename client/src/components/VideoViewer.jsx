import { useEffect, useState } from "react";
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
} from "lucide-react";
import {
  useEffect as desktop_useEffect,
  useLayoutEffect as desktop_useLayoutEffect,
  useMemo as desktop_useMemo,
  useRef as desktop_useRef,
  useState as desktop_useState,
} from "react";
import {
  ArrowLeft as desktop_ArrowLeft,
  Heart as desktop_Heart,
  MessageCircle as desktop_MessageCircle,
  Share2 as desktop_Share2,
  MoreVertical as desktop_MoreVertical,
  Play as desktop_Play,
  Pause as desktop_Pause,
  Volume2 as desktop_Volume2,
  VolumeX as desktop_VolumeX,
  Maximize as desktop_Maximize,
  Settings as desktop_Settings,
  Captions as desktop_Captions,
  CheckCircle2 as desktop_CheckCircle2,
  Bookmark as desktop_Bookmark,
} from "lucide-react";
import desktop_TopBar from "../components/TopBar";
import desktop_CommentSection from "./comments/CommentSection";
import desktop_api from "../services/api";
import MentionText from "./MentionText";

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

// Request a browser-friendly, bandwidth-conscious Cloudinary rendition for playback.
// Non-Cloudinary media URLs are left unchanged.
function getOptimizedPlaybackUrl(value) {
  if (typeof value !== "string" || !value) return value;

  const marker = "/video/upload/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1 || !/https?:\/\/res\.cloudinary\.com\//i.test(value)) {
    return value;
  }

  const pathStart = markerIndex + marker.length;
  const remainder = value.slice(pathStart);
  const firstSegment = remainder.split("/")[0];

  // Avoid stacking transformations on URLs that are already transformed.
  if (firstSegment.includes(",")) return value;

  // This is only a fallback when adaptive HLS cannot be used or is still being
  // prepared. Keep it light on constrained links so a missing HLS manifest does
  // not force a large progressive MP4 to download before the first frame.
  const profile = getNetworkPlaybackProfile();
  const width =
    profile.startupHeight <= 240
      ? 426
      : profile.startupHeight <= 360
        ? 640
        : 960;
  const bitrate =
    profile.startupHeight <= 240
      ? "350k"
      : profile.startupHeight <= 360
        ? "600k"
        : "900k";
  const quality = profile.constrained ? "q_auto:eco" : "q_auto:good";
  const transformation = `c_limit,w_${width},br_${bitrate},vc_h264,${quality},f_mp4`;
  return `${value.slice(0, pathStart)}${transformation}/${remainder}`;
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
  if (
    typeof value !== "string" ||
    !/^https?:\/\/res\.cloudinary\.com\//i.test(value)
  ) {
    return "";
  }

  const marker = "/video/upload/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return "";

  const pathStart = markerIndex + marker.length;
  let assetPath = value.slice(pathStart).split(/[?#]/, 1)[0];
  const firstSegment = assetPath.split("/")[0];

  // Match the eagerly generated HLS stream prepared while the post is
  // published. This avoids asking Cloudinary to build sp_auto renditions on
  // the viewer's first request, which caused the first-open delay.
  if (firstSegment.includes(",")) {
    assetPath = assetPath.slice(firstSegment.length).replace(/^\/+/, "");
  }

  assetPath = assetPath.replace(/\.(mp4|mov|m4v|webm|avi|mkv)$/i, "");
  if (!assetPath || !assetPath.includes("/")) return "";

  return `${value.slice(0, pathStart)}sp_full_hd/${assetPath}.m3u8`;
}

// Choose a network-aware first rendition for Auto playback. The player can
// improve quality after the first fragment is buffered; manually selected quality
// remains respected and is not silently downgraded.
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
  const saveData = connection?.saveData === true;
  const touchDevice =
    typeof navigator !== "undefined" &&
    ((Number(navigator.maxTouchPoints) || 0) > 0 ||
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches));

  const verySlow =
    saveData ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    (hasDownlink && downlink < 0.65);
  const knownWeakLink = hasDownlink && downlink < 1.2;
  const slow =
    verySlow ||
    (effectiveType === "3g" && knownWeakLink) ||
    (hasDownlink && downlink < 1.8);

  // Start Auto at the clearest rendition that fits a conservative share of
  // the reported connection. Even very slow links may be able to sustain an
  // efficient 360p rendition; limiting every weak connection to 240p made the
  // feed look needlessly blurry. Auto ABR can still step down if real throughput
  // proves insufficient, and a manual quality choice remains locked.
  const unknownMobileLink = touchDevice && !hasDownlink;
  const startupHeight = slow || unknownMobileLink ? 360 : 480;

  let defaultBandwidthEstimate = touchDevice ? 350_000 : 550_000;
  if (verySlow) {
    defaultBandwidthEstimate = 180_000;
  } else if (knownWeakLink) {
    defaultBandwidthEstimate = Math.max(
      200_000,
      Math.min(360_000, downlink * 500_000),
    );
  } else if (hasDownlink) {
    defaultBandwidthEstimate = Math.max(
      350_000,
      Math.min(1_600_000, downlink * 750_000),
    );
  }

  // Network Information's downlink is an estimate, not a guarantee. Use most
  // of it for the opening fragment so we don't default to the smallest variant;
  // HLS.js starts adapting from measured fragment throughput immediately after.
  const startupBandwidthBudget = hasDownlink
    ? Math.max(180_000, Math.min(3_500_000, downlink * 1_000_000 * 0.85))
    : defaultBandwidthEstimate * (slow ? 1.45 : 1.55);

  return {
    touchDevice,
    startupHeight,
    startupBandwidthBudget,
    constrained: slow,
    defaultBandwidthEstimate,
  };
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
// Keep the one preloaded next-video segment available long enough for HLS.js
// to reuse it when that post becomes active. Some 720p/1080p startup fragments
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
const HLS_PREFETCH_CACHE_LIMIT = 4;

// When a video opens, stop unfinished background preloads so they do not
// compete with the active stream. Keep completed resources for the active video;
// the browser may reuse them from HTTP cache when caching is enabled.
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
        // Don't accidentally read/cache a whole packed media file when the
        // origin ignores Range. It could cost megabytes on a slow connection.
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
      const sharedPromise =
        cachedData != null
          ? Promise.resolve(cachedData)
          : inFlight?.type === type
            ? inFlight.promise
            : null;

      if (!sharedPromise) return super.load(context, config, callbacks);

      this.warmRequestAborted = false;
      const startedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      sharedPromise
        .then((data) => {
          if (this.warmRequestAborted) return;

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
        .catch(() => {
          if (!this.warmRequestAborted) super.load(context, config, callbacks);
        });
    }

    abort() {
      this.warmRequestAborted = true;
      super.abort();
    }

    destroy() {
      this.warmRequestAborted = true;
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
    variants.push({
      url: resolvePlaylistUri(lines[uriIndex], playlistUrl),
      width: resolution ? Number(resolution[1]) : 0,
      height: resolution ? Number(resolution[2]) : 0,
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
        firstSegment = { url };
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
  // Playlist-only prewarming by default. A large first segment can take many seconds
  // on 3G and compete with the active stream; the active HLS player owns segments.
  const includeFirstSegment = options?.includeFirstSegment === true;
  const cacheKey = `${hlsUrl}::${qualityKey}::${includeFirstSegment ? "segment" : "playlist"}`;

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

  const request = (async () => {
    const masterText = await fetchCachedText(hlsUrl, signal);
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
      // Match the player's network-aware startup selection: prefer a 360p/480p
      // variant within the startup bandwidth budget, rather than always warming
      // the lowest-bitrate stream (which left Auto playback visibly blurry).
      const profile = getNetworkPlaybackProfile();
      const usableVariants = variants.filter((variant) => variant.height > 0);
      const withinHeight = usableVariants.filter(
        (variant) => variant.height <= profile.startupHeight,
      );
      const pool = withinHeight.length ? withinHeight : usableVariants;
      const withinBudget = pool.filter(
        (variant) =>
          !variant.bandwidth ||
          variant.bandwidth <= profile.startupBandwidthBudget,
      );
      startupVariant =
        [...withinBudget].sort(
          (a, b) => b.height - a.height || b.bandwidth - a.bandwidth,
        )[0] ||
        [...pool].sort(
          (a, b) =>
            (a.bandwidth || Number.POSITIVE_INFINITY) -
              (b.bandwidth || Number.POSITIVE_INFINITY) || a.height - b.height,
        )[0] ||
        [...variants].sort(
          (a, b) => a.height - b.height || a.bandwidth - b.bandwidth,
        )[0];
    }

    if (!startupVariant) {
      // A manifest-only prewarm is enough for off-screen mobile cards. Do not
      // download a video segment for cards the viewer may never open.
      if (includeFirstSegment) {
        const resources = parseFirstMediaResources(masterText, hlsUrl);
        if (!resources.length) {
          throw new Error("No initial HLS media resource was found");
        }
        const results = await Promise.allSettled(
          resources.map((url) => warmCachedResource(url, signal)),
        );
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("Could not warm the initial HLS media resource");
        }
      }
      hlsManifestPreloadCompleted.add(cacheKey);
      return true;
    }

    const mediaPlaylistText = await fetchCachedText(startupVariant.url, signal);
    if (includeFirstSegment) {
      const resources = parseFirstMediaResources(
        mediaPlaylistText,
        startupVariant.url,
      );
      if (!resources.length) {
        throw new Error("No initial HLS media resource was found");
      }
      const results = await Promise.allSettled(
        resources.map((url) => warmCachedResource(url, signal)),
      );
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("Could not warm the initial HLS media resource");
      }
    }
    // On success, preserve this prewarm when the active HLS player takes over.
    hlsManifestPreloadCompleted.add(cacheKey);
    return true;
  })()
    .catch(() => {
      // Prefetch must never block playback; the active player retries normally.
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

// Start loading the local HLS chunk while the Home feed is visible. Skip it on
// browsers that can only play native HLS, to avoid spending mobile bandwidth
// on a library those browsers cannot use.
if (browserCanUseHlsJs()) {
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
) {
  if (!video || !originalUrl || !fallbackUrl) return () => {};

  const hlsUrl = getCloudinaryHlsUrl(originalUrl);
  if (!hlsUrl) return () => {};

  const initialQualityKey =
    initialQuality === "auto" || initialQuality == null
      ? "auto"
      : String(
          Number.parseInt(String(initialQuality).replace(/[^0-9]/g, ""), 10),
        );
  // Stop unfinished background work immediately on open. Waiting for an
  // in-flight preloader made the viewer wait for the whole first segment (which
  // took 17.8 seconds in the user's Network screenshot). Completed cacheable
  // resources are kept; the active HLS player starts its own load right away.
  cancelCloudinaryVideoPreloadsExcept(hlsUrl);

  let cancelled = false;
  let hls = null;
  let networkRetries = 0;
  let mediaRetries = 0;
  let manualRecoveryAttempts = 0;
  let selectedStreamQuality =
    initialQualityKey === "NaN" ? "auto" : initialQualityKey;
  let streamHasPlayed = false;
  let streamLoadStarted = false;
  // Start Auto at a network-aware low level, then re-enable adaptation once the
  // first fragment is buffered. Auto can move up or down according to real
  // throughput; manual quality selection remains fixed by selectedStreamQuality.
  let autoStartupLevelPending = false;
  const savedResumeTime = Number.isFinite(Number(resumeTime))
    ? Math.max(0, Number(resumeTime))
    : 0;
  let resumePositionApplied = savedResumeTime < 0.5;

  const rememberPosition = () => {
    const time = Number(video.currentTime);
    if (Number.isFinite(time) && time >= 0) onRememberPosition?.(time);
  };

  // Each post keeps its own playhead when the user scrolls away and comes back.
  // HLS is reattached for the active post only, so restore the saved position
  // once the new media element exposes metadata/seekability.
  const restoreResumePosition = () => {
    if (cancelled || resumePositionApplied || savedResumeTime < 0.5) return;
    if (video.readyState < 1) return;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      if (savedResumeTime >= video.duration - 0.35) {
        resumePositionApplied = true;
        return;
      }
    }

    try {
      if (Math.abs((Number(video.currentTime) || 0) - savedResumeTime) > 0.75) {
        video.currentTime = savedResumeTime;
      }
      resumePositionApplied = true;
    } catch {
      // Retry on canplay/durationchange if the stream is not seekable yet.
    }
  };

  const onVideoPlaying = () => {
    streamHasPlayed = true;
    rememberPosition();
  };
  video.addEventListener("playing", onVideoPlaying);
  video.addEventListener("timeupdate", rememberPosition);
  video.addEventListener("loadedmetadata", restoreResumePosition);
  video.addEventListener("durationchange", restoreResumePosition);
  video.addEventListener("canplay", restoreResumePosition);

  const playIfRequested = () => {
    if (cancelled || !shouldPlay()) return;

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
        if (cancelled || !shouldPlay()) return;

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

  const onMediaReady = () => playIfRequested();

  video.addEventListener("loadeddata", onMediaReady);
  video.addEventListener("canplay", onMediaReady);

  const useProgressiveFallback = () => {
    if (cancelled) return;
    if (hls) {
      hls.destroy();
      hls = null;
    }
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);
    video.src = fallbackUrl;
    video.load();
    playIfRequested();
  };

  const onNativeHlsError = () => useProgressiveFallback();

  const startNativeHls = () => {
    if (cancelled) return;
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);
    video.preload = "auto";
    video.addEventListener("error", onNativeHlsError, { once: true });
    video.src = hlsUrl;
    video.load();
    playIfRequested();
  };

  const start = async () => {
    const nativeHlsSupported = Boolean(
      video.canPlayType("application/vnd.apple.mpegurl"),
    );

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
    const Hls = await loadHlsLibrary();
    if (cancelled) return;

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
    hls = new Hls({
      loader: createWarmCacheLoader(Hls),
      enableWorker: true,
      startLevel: -1,
      // Be deliberately conservative before HLS has a reliable bandwidth
      // sample. This prevents a high first fragment from creating a long wait.
      // Respect the actual conservative estimate. Forcing a 900 kbps starting
      // estimate and a 550 kbps minimum made HLS choose 480p even on a ~0.59 Mbps
      // connection, producing a 1.4 MB segment that took 17.8 seconds to download.
      abrEwmaDefaultEstimate: networkProfile.defaultBandwidthEstimate,
      abrBandWidthFactor: networkProfile.constrained ? 0.88 : 0.92,
      abrBandWidthUpFactor: networkProfile.constrained ? 0.84 : 0.9,
      maxStarvationDelay: networkProfile.constrained ? 2 : 3,
      maxLoadingDelay: networkProfile.constrained ? 3 : 4,
      startFragPrefetch: true,
      // Wait until the manifest is parsed so the first level can be selected
      // deliberately. Auto starts from the same small rendition warmed by the
      // Home-card preloader, rather than guessing a high level on the click path.
      autoStartLoad: false,
      // Cloudinary can supply renditions up to 1080p when the source supports
      // it. Do not cap to the rendered element size, which can override a
      // viewer's explicit manual quality choice on smaller screens.
      capLevelToPlayerSize: false,
      maxBufferLength: networkProfile.touchDevice
        ? 6
        : networkProfile.constrained
          ? 8
          : 14,
      maxMaxBufferLength: networkProfile.touchDevice
        ? 12
        : networkProfile.constrained
          ? 14
          : 24,
      backBufferLength: networkProfile.touchDevice ? 3 : 6,
      manifestLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 2,
      fragLoadingMaxRetry: 3,
    });

    const publishQualityOptions = () => {
      if (cancelled || !hls) return;
      const bestLevelByHeight = new Map();
      hls.levels.forEach((level, index) => {
        const height = Number(level.height) || 0;
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
      onQualityOptionsChange?.(options);
    };

    const getLevelForRequestedQuality = (requestedQuality) => {
      if (!hls?.levels?.length) return null;

      const available = hls.levels
        .map((level, index) => ({
          index,
          height: Number(level.height) || 0,
          bitrate: Number(level.bitrate) || 0,
        }))
        .filter((level) => level.height > 0);

      if (!available.length) return null;

      if (requestedQuality === "auto" || requestedQuality == null) {
        // Choose the clearest available rendition within the network-aware
        // startup budget. The same rule is used by preloadCloudinaryVideoStream
        // so the cached first fragment matches the active player request.
        const withinHeight = available.filter(
          (level) => level.height <= networkProfile.startupHeight,
        );
        const pool = withinHeight.length ? withinHeight : available;
        const withinBudget = pool.filter(
          (level) =>
            !level.bitrate ||
            level.bitrate <= networkProfile.startupBandwidthBudget,
        );
        return (
          [...withinBudget].sort(
            (a, b) => b.height - a.height || b.bitrate - a.bitrate,
          )[0] ||
          [...pool].sort(
            (a, b) =>
              (a.bitrate || Number.POSITIVE_INFINITY) -
                (b.bitrate || Number.POSITIVE_INFINITY) || a.height - b.height,
          )[0] ||
          [...available].sort((a, b) => a.bitrate - b.bitrate)[0]
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

    onQualityControllerChange?.({
      selectQuality: (requestedQuality) => {
        // Store the user's choice even before the manifest arrives. MANIFEST_PARSED
        // uses it to choose the initial rendition before any segment is requested.
        selectedStreamQuality =
          requestedQuality === "auto" || requestedQuality == null
            ? "auto"
            : String(requestedQuality);

        if (!hls) return;
        hls.capLevelToPlayerSize = false;
        hls.autoLevelCapping = -1;

        const target = getLevelForRequestedQuality(selectedStreamQuality);
        if (!target) return;

        if (!streamLoadStarted) {
          hls.startLevel = target.index;
          // Setting loadLevel locks hls.js to the user's selected rendition;
          // Auto mode alone is allowed to adapt down when bandwidth falls.
          hls.loadLevel = selectedStreamQuality === "auto" ? -1 : target.index;
          return;
        }

        if (selectedStreamQuality === "auto") {
          autoStartupLevelPending = false;
          hls.currentLevel = -1;
          return;
        }

        autoStartupLevelPending = false;

        // Do not let player dimensions or a previous auto cap downgrade a
        // viewer's explicit quality selection. While playing, nextLevel switches
        // at the earliest safe boundary without flushing the current buffer.
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
      if (!cancelled && hls) hls.loadSource(hlsUrl);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      publishQualityOptions();
      if (cancelled || !hls) return;

      // Do not set a 480p minimum in Auto mode. A hard quality floor can force
      // multi-megabyte first fragments on a weak mobile connection and delay the
      // first frame. Auto starts conservatively and may improve after buffering;
      // an explicit user-selected quality remains locked as requested.
      const startupLevel = getLevelForRequestedQuality(selectedStreamQuality);
      if (startupLevel) {
        hls.startLevel = startupLevel.index;
        // In Auto mode, use this small first fragment to get playback started;
        // ABR is re-enabled after it is buffered below and may improve quality.
        // An explicit user quality is honored from the very first fragment.
        if (selectedStreamQuality === "auto") {
          hls.loadLevel = startupLevel.index;
          autoStartupLevelPending = true;
        } else {
          hls.loadLevel = startupLevel.index;
          autoStartupLevelPending = false;
        }
      }
      // Do not wait for any speculative preload here. On slow mobile links,
      // that promise can take several seconds because it fetches a playlist and
      // segment sequentially. Start the active player's media requests as soon
      // as the master manifest and startup level are ready.
      if (cancelled || !hls) return;
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

      // Switch Auto mode back to ABR after the first low-bitrate fragment is
      // safely buffered. This is intentionally one-shot, not a quality lock.
      if (autoStartupLevelPending && selectedStreamQuality === "auto" && hls) {
        autoStartupLevelPending = false;
        // Release both the explicit startup level and load-level override. This
        // lets HLS.js use measured fragment throughput to move up to 480p/720p
        // where sustainable, instead of lingering at the startup rendition.
        hls.startLevel = -1;
        hls.loadLevel = -1;
      }
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (cancelled || !data?.fatal) return;

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

  start().catch(() => {
    // Don't silently downgrade a fixed quality if initialization fails.
    // Native HLS may still honor the stream on Safari; otherwise report the
    // limitation and leave the selected stream intact for a retry.
    if (cancelled) return;
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

  return () => {
    cancelled = true;
    rememberPosition();
    video.removeEventListener("error", onNativeHlsError);
    video.removeEventListener("loadeddata", onMediaReady);
    video.removeEventListener("canplay", onMediaReady);
    video.removeEventListener("playing", onVideoPlaying);
    video.removeEventListener("timeupdate", rememberPosition);
    video.removeEventListener("loadedmetadata", restoreResumePosition);
    video.removeEventListener("durationchange", restoreResumePosition);
    video.removeEventListener("canplay", restoreResumePosition);
    if (hls) {
      hls.destroy();
      hls = null;
    }
    onQualityControllerChange?.(null);
    onQualityOptionsChange?.([]);
    video.pause();
    if (video.isConnected) {
      video.removeAttribute("src");
      video.load();
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
    if (isDeclaredPhotoPost(post)) return "";

    const explicitVideoCandidates = [
      post?.videoUrl,
      post?.video,
      post?.videoFile,
      Array.isArray(post?.videos) ? post.videos[0] : "",
    ];
    for (const candidate of explicitVideoCandidates) {
      const url = mediaValueToUrl(candidate);
      if (url && !looksLikeImageMedia(url)) return resolveMediaUrl(url);
    }

    const ambiguousCandidates = [
      post?.mediaUrl,
      post?.media,
      Array.isArray(post?.mediaUrls) ? post.mediaUrls[0] : "",
      post?.url,
    ];
    for (const candidate of ambiguousCandidates) {
      const url = mediaValueToUrl(candidate);
      if (!url || looksLikeImageMedia(url)) continue;
      return resolveMediaUrl(url);
    }
    return "";
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
    const [qualityOptions, setQualityOptions] = useState([]);
    const [selectedQuality, setSelectedQuality] = useState("auto");
    const qualityControllerRef = useRef(null);
    const selectedQualityRef = useRef("auto");
    selectedQualityRef.current = selectedQuality;
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
    useEffect(() => {
      // Every newly selected post should show its poster until its own video
      // emits `playing`; don't reuse the previous video's ready state.
      setPlayingVideoPostId(null);
    }, [activePostId]);
    const activeOriginalVideoUrl = getOriginalVideoUrl(activePost);
    const activePostIsPhoto = isPhotoPost(activePost);
    const shouldPlayActiveVideoRef = useRef(!paused);
    shouldPlayActiveVideoRef.current = !paused;

    // Prefer adaptive HLS delivery for the active Cloudinary video. The helper
    // falls back to a small progressive MP4 if HLS is unavailable or fails.
    useEffect(() => {
      qualityControllerRef.current = null;
      setQualityOptions([]);

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
        (levels) => {
          setQualityOptions(levels);
          if (selectedQualityRef.current !== "auto") {
            qualityControllerRef.current?.selectQuality(
              selectedQualityRef.current,
            );
          }
        },
        (controller) => {
          qualityControllerRef.current = controller;
          if (controller) {
            controller.selectQuality(selectedQualityRef.current);
          }
        },
        selectedQualityRef.current,
        playbackPositionsRef.current.get(String(activePostId)) || 0,
        (time) => {
          if (Number.isFinite(time) && time >= 0) {
            playbackPositionsRef.current.set(String(activePostId), time);
          }
        },
      );
    }, [activePostId, activeOriginalVideoUrl, activePostIsPhoto]);

    // While the current video plays, warm only the next feed item's HLS playlists.
    // Downloading its media segment can compete with the active video on slow links. Rebuild this observer when the
    // active index changes: otherwise a farther card can enter the expanded
    // root first, be skipped as "not next", and never fire again while it stays
    // intersecting. Keep only one next stream warm to avoid competing with the
    // active video on mobile data.
    useEffect(() => {
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

            // Only prewarm the immediate next post. More than one media stream
            // can compete with the video currently playing on mobile data.
            if (candidate.index !== currentIndex + 1) continue;

            observer.unobserve(entry.target);
            if (isPhotoPost(candidate.post)) continue;

            const nextUrl = getOriginalVideoUrl(candidate.post);
            if (getCloudinaryHlsUrl(nextUrl)) {
              preloadCloudinaryVideoStream(
                nextUrl,
                selectedQualityRef.current,
                { includeFirstSegment: false },
              );
            }
          }
        },
        {
          root: feed,
          // Start warming the next snap page before it enters the visible area.
          rootMargin: "0px 0px 130% 0px",
          threshold: 0.01,
        },
      );

      candidateByElement.forEach(({ index }, element) => {
        if (index > activeIndex) observer.observe(element);
      });

      return () => observer.disconnect();
    }, [feedPreloadPostIdsKey, activeIndex]);

    // Keep the next playlist ready, but do not download its media segment while
    // the current video's startup fragment is still establishing playback. On
    // slow links, simultaneous first fragments compete and delay the active video.
    useEffect(() => {
      if (
        !activePostId ||
        String(playingVideoPostId) !== String(activePostId)
      ) {
        return undefined;
      }

      const activeVideo = videoRefs.current[activePostId];
      if (!activeVideo) return undefined;

      let nextUrl = "";
      for (let index = activeIndex + 1; index < posts.length; index += 1) {
        const candidate = posts[index];
        if (isPhotoPost(candidate)) continue;
        const candidateUrl = getOriginalVideoUrl(candidate);
        if (getCloudinaryHlsUrl(candidateUrl)) {
          nextUrl = candidateUrl;
          break;
        }
      }
      if (!nextUrl) return undefined;

      preloadCloudinaryVideoStream(nextUrl, "auto", {
        includeFirstSegment: false,
      });

      let segmentPreloaded = false;
      let segmentPreloadInProgress = false;
      let lastSegmentPreloadAttemptAt = 0;
      const cleanupListeners = () => {
        activeVideo.removeEventListener("timeupdate", maybePreloadNextSegment);
        activeVideo.removeEventListener("progress", maybePreloadNextSegment);
        activeVideo.removeEventListener("playing", maybePreloadNextSegment);
      };
      const maybePreloadNextSegment = () => {
        if (
          segmentPreloaded ||
          segmentPreloadInProgress ||
          activeVideo.paused ||
          activeVideo.ended
        )
          return;

        // Failed speculative requests used to be marked complete before the
        // network request finished, so they never retried during this playback.
        const now = Date.now();
        if (now - lastSegmentPreloadAttemptAt < 2500) return;

        const currentTime = Number(activeVideo.currentTime) || 0;
        if (!activeVideo.buffered?.length) return;

        let bufferedAhead = 0;
        for (let index = 0; index < activeVideo.buffered.length; index += 1) {
          const start = activeVideo.buffered.start(index);
          const end = activeVideo.buffered.end(index);
          if (currentTime >= start - 0.15 && currentTime <= end + 0.15) {
            bufferedAhead = Math.max(0, end - currentTime);
            break;
          }
        }

        // Prepare early, but keep a small safety buffer for the active video.
        // Weak connections still get a little more headroom before competing.
        const minimumBufferedAhead = getNetworkPlaybackProfile().constrained
          ? 1.0
          : 0.45;
        if (bufferedAhead < minimumBufferedAhead) return;

        segmentPreloadInProgress = true;
        lastSegmentPreloadAttemptAt = now;
        Promise.resolve(
          preloadCloudinaryVideoStream(nextUrl, selectedQualityRef.current, {
            includeFirstSegment: true,
          }),
        )
          .then((prepared) => {
            if (prepared === true) {
              segmentPreloaded = true;
              cleanupListeners();
            }
          })
          .finally(() => {
            segmentPreloadInProgress = false;
          });
      };

      activeVideo.addEventListener("timeupdate", maybePreloadNextSegment);
      activeVideo.addEventListener("progress", maybePreloadNextSegment);
      activeVideo.addEventListener("playing", maybePreloadNextSegment);
      maybePreloadNextSegment();

      return cleanupListeners;
    }, [feedPreloadPostIdsKey, activeIndex, activePostId, playingVideoPostId]);

    function changeVideoQuality(quality) {
      const value = quality === "auto" ? "auto" : String(quality);
      selectedQualityRef.current = value;
      setSelectedQuality(value);
      qualityControllerRef.current?.selectQuality(value);
    }

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

        lastFeedScrollTopRef.current = currentFeed.scrollTop;

        if (nextIndex !== activeIndexRef.current) {
          activeIndexRef.current = nextIndex;

          setActiveIndex(nextIndex);

          setPaused(false);
        }
      });
    }, [posts, revealDetails]);

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
      window.dispatchEvent(
        new CustomEvent("spotli:open-post-menu", {
          detail: { post },
        }),
      );
    }

    if (!posts.length || !activePost) return null;

    return (
      <div className="fixed inset-0 z-100 block overflow-hidden bg-[#080808] text-white lg:hidden">
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
                  className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
                  style={{
                    backgroundImage: thumbnail
                      ? `url("${thumbnail}")`
                      : undefined,
                  }}
                />

                <div className="pointer-events-none absolute inset-0 bg-black/55" />

                <div
                  className={`absolute overflow-hidden bg-black shadow-2xl ${
                    isLandscape && !photoPost
                      ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      : "inset-0 h-full w-full"
                  }`}
                  style={
                    isLandscape && !photoPost
                      ? {
                          width: "min(100vw, 177.7778vh)",

                          height: "min(100vh, 56.25vw)",
                        }
                      : undefined
                  }
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
                        }}
                        src={
                          getCloudinaryHlsUrl(getOriginalVideoUrl(post))
                            ? undefined
                            : videoUrl || DEMO_VIDEO
                        }
                        poster={thumbnail || undefined}
                        autoPlay={isActive && !paused}
                        controls={false}
                        muted
                        loop
                        playsInline
                        preload={isActive ? "auto" : "none"}
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
                    className="absolute inset-x-0 bottom-0 z-60 w-full bg-transparent px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 text-white transition-opacity duration-300"
                    onClick={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="flex w-full items-center gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => togglePlayback(postId)}
                        aria-label={paused ? "Play video" : "Pause video"}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        {paused ? (
                          <Play size={17} fill="currentColor" />
                        ) : (
                          <Pause size={17} />
                        )}
                      </button>
                      <span className="shrink-0 tabular-nums text-[10px] sm:text-xs">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleMute(postId)}
                        aria-label={muted ? "Unmute video" : "Mute video"}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${captionsEnabled ? "bg-[#FF2D4A]/15 text-[#FF2D4A]" : "text-white hover:bg-white/10"}`}
                      >
                        <Captions size={17} />
                      </button>
                      <div className="relative shrink-0">
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
                            <div className="my-1 border-t border-white/15 pt-1">
                              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                                Video quality
                              </p>
                              <button
                                type="button"
                                aria-pressed={selectedQuality === "auto"}
                                onClick={() => changeVideoQuality("auto")}
                                className={`block w-full rounded px-3 py-2 text-left text-xs ${selectedQuality === "auto" ? "text-[#FF2D4A]" : "text-white"}`}
                              >
                                Auto {selectedQuality === "auto" ? "✓" : ""}
                              </button>
                              {qualityOptions.length > 0 ? (
                                [...qualityOptions].reverse().map((quality) => (
                                  <button
                                    key={quality.height}
                                    type="button"
                                    aria-pressed={
                                      selectedQuality === String(quality.height)
                                    }
                                    onClick={() =>
                                      changeVideoQuality(quality.height)
                                    }
                                    className={`block w-full rounded px-3 py-2 text-left text-xs ${selectedQuality === String(quality.height) ? "text-[#FF2D4A]" : "text-white"}`}
                                  >
                                    {quality.label}{" "}
                                    {selectedQuality === String(quality.height)
                                      ? "✓"
                                      : ""}
                                  </button>
                                ))
                              ) : (
                                <p className="px-3 py-2 text-[11px] leading-snug text-white/55">
                                  Manual quality is unavailable for this
                                  video/browser.
                                </p>
                              )}
                            </div>
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
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
                      className="mt-1 block h-7 w-full cursor-pointer touch-pan-x accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    />
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-linear-to-b from-black/70 to-transparent" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-72 bg-linear-to-t from-black/90 via-black/35 to-transparent" />

                <header className="absolute left-4 right-4 top-4 z-40 flex items-center gap-3">
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

                <aside className="absolute bottom-32 right-2 z-40 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleLike(postId)}
                    aria-label={
                      likedPosts[postId] ? "Unlike post" : "Like post"
                    }
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
                  >
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm ${
                        likedPosts[postId] ? "text-[#FF2D4A]" : "text-white"
                      }`}
                    >
                      <Heart
                        size={24}
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
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <MessageCircle size={24} />
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
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <Share2 size={20} />
                    </span>

                    <span className="text-[11px] font-semibold">
                      {formatCount(post.shares || 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openPostMenu(post)}
                    aria-label="More post options"
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-black/35 backdrop-blur-sm">
                      <MoreVertical size={20} />
                    </span>
                  </button>

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
                    className="flex min-h-11 min-w-11 flex-col items-center gap-0.5"
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
                    <span className="text-[10px] font-semibold">Save</span>
                  </button>
                </aside>

                <div
                  className={`absolute bottom-24 left-5 right-28 z-30 max-w-4xl transition-opacity duration-300 ${
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

function createDesktopViewerImplementation() {
  // Keep the original desktop viewer's imports scoped to its implementation.
  const useEffect = desktop_useEffect;
  const useMemo = desktop_useMemo;
  const useRef = desktop_useRef;
  const useState = desktop_useState;
  const ArrowLeft = desktop_ArrowLeft;
  const Heart = desktop_Heart;
  const MessageCircle = desktop_MessageCircle;
  const Share2 = desktop_Share2;
  const MoreVertical = desktop_MoreVertical;
  const Play = desktop_Play;
  const Pause = desktop_Pause;
  const Volume2 = desktop_Volume2;
  const VolumeX = desktop_VolumeX;
  const Maximize = desktop_Maximize;
  const Settings = desktop_Settings;
  const Captions = desktop_Captions;
  const CheckCircle2 = desktop_CheckCircle2;
  const Bookmark = desktop_Bookmark;
  const TopBar = desktop_TopBar;
  const CommentSection = desktop_CommentSection;
  const api = desktop_api;

  const API_ORIGIN = (
    import.meta.env.VITE_API_URL || "http://localhost:5000/api"
  ).replace(/\/api\/?$/, "");

  function getCreatorName(post) {
    const creator = post?.creator;

    if (typeof creator === "string" && creator.trim()) return creator;

    return (
      creator?.name ||
      [creator?.firstName, creator?.lastName].filter(Boolean).join(" ") ||
      post?.creatorName ||
      post?.user?.name ||
      post?.user?.username ||
      "Spotli creator"
    );
  }

  function getCreatorAvatar(post) {
    const creator = post?.creator;

    const rawAvatar =
      creator?.avatar ||
      creator?.profileImage ||
      creator?.profilePicture ||
      creator?.photoURL ||
      creator?.image ||
      post?.creatorAvatar ||
      post?.avatar ||
      post?.profileImage ||
      post?.profilePicture ||
      post?.user?.avatar ||
      post?.user?.profileImage ||
      post?.user?.profilePicture ||
      post?.user?.photoURL ||
      post?.user?.image ||
      "";

    if (typeof rawAvatar !== "string" || !rawAvatar.trim()) return "";

    if (/^(https?:|data:|blob:)/i.test(rawAvatar)) return rawAvatar;

    if (rawAvatar.startsWith("/")) return `${API_ORIGIN}${rawAvatar}`;

    return rawAvatar;
  }

  function getPostImages(post) {
    const toUrl = (value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        return (
          value.url ||
          value.src ||
          value.imageUrl ||
          value.secure_url ||
          value.path ||
          ""
        );
      }
      return "";
    };

    // Prefer explicit video thumbnails/posters. Some Spotli posts store the
    // uploaded thumbnail as an object (customThumbnail.url), not a string.
    const thumbnailCandidates = [
      post?.customThumbnail,
      post?.thumbnailUrl,
      post?.thumbnail,
      post?.posterUrl,
      post?.poster,
      post?.previewImage,
      post?.coverImage,
      post?.imageUrl,
      post?.image,
      post?.photoUrl,
    ]
      .map(toUrl)
      .filter(Boolean);

    const collections = [post?.mediaUrls, post?.images, post?.photos];
    const collectionImages = collections
      .filter(Array.isArray)
      .flat()
      .map(toUrl)
      .filter(Boolean);

    const photoMedia = isPhotoMediaPost(post)
      ? [toUrl(post?.mediaUrl), toUrl(post?.media)].filter(Boolean)
      : [];

    return [
      ...new Set([...thumbnailCandidates, ...photoMedia, ...collectionImages]),
    ];
  }

  function isPhotoMediaPost(post) {
    const mediaType = String(post?.mediaType || "")
      .trim()
      .toLowerCase();
    if (["photo", "image", "photos", "gallery"].includes(mediaType))
      return true;
    if (["video", "reel"].includes(mediaType)) return false;

    const types = [post?.type, post?.postType, post?.kind]
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (
      types.some((type) =>
        ["photo", "image", "photos", "gallery"].includes(type),
      )
    )
      return true;
    if (types.some((type) => ["video", "reel"].includes(type))) return false;
    if (post?.isImagePost === true || post?.isPhotoPost === true) return true;
    if (post?.isVideoPost === true) return false;

    const sourceUrl = (value) => {
      if (typeof value === "string") return value;
      if (!value || typeof value !== "object") return "";
      return (
        value.url ||
        value.src ||
        value.imageUrl ||
        value.videoUrl ||
        value.secure_url ||
        value.path ||
        ""
      );
    };
    const looksImage = (value) =>
      /(?:\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#]|$)|\/image\/upload\/|^data:image\/)/i.test(
        sourceUrl(value),
      );
    const looksVideo = (value) =>
      /(?:\.(?:mp4|mov|m4v|webm|avi|mkv|m3u8|mpd)(?:[?#]|$)|\/video\/upload\/|^data:video\/)/i.test(
        sourceUrl(value),
      );

    if (
      [post?.videoUrl, post?.video, post?.videoFile, post?.videos?.[0]].some(
        looksVideo,
      )
    )
      return false;
    if ([post?.mediaUrl, post?.media, post?.mediaUrls?.[0]].some(looksVideo))
      return false;
    if ([post?.mediaUrl, post?.media, post?.mediaUrls?.[0]].some(looksImage))
      return true;
    if (Array.isArray(post?.photos) && post.photos.length) return true;
    if (
      Array.isArray(post?.images) &&
      post.images.length &&
      !post?.videoUrl &&
      !post?.video
    )
      return true;
    return false;
  }

  function resolveMediaUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    const url = value.trim();

    if (/^(https?:|data:|blob:)/i.test(url)) return url;

    if (url.startsWith("//")) {
      return `${window.location.protocol}${url}`;
    }

    if (url.startsWith("/")) {
      return `${API_ORIGIN}${url}`;
    }

    // API responses may return relative paths such as "uploads/thumb.jpg".
    // Resolve those against the backend instead of the frontend page URL.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return `${API_ORIGIN}/${url.replace(/^\.\//, "")}`;
    }

    return url;
  }

  function getOriginalVideoUrl(post) {
    // The API may return the uploaded video as a string or as a media object.
    // Normalize both formats before resolving the backend URL.
    const toMediaUrl = (value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        return (
          value.url ||
          value.src ||
          value.videoUrl ||
          value.mediaUrl ||
          value.secure_url ||
          value.path ||
          value.location ||
          ""
        );
      }
      return "";
    };

    if (isPhotoMediaPost(post)) return "";

    const explicitVideoCandidates = [
      post?.videoUrl,
      post?.video,
      post?.videoFile,
      post?.videos?.[0],
    ];
    for (const candidate of explicitVideoCandidates) {
      const rawUrl = toMediaUrl(candidate);
      if (
        rawUrl &&
        !/(?:\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#]|$)|\/image\/upload\/|^data:image\/)/i.test(
          rawUrl,
        )
      ) {
        return resolveMediaUrl(rawUrl);
      }
    }

    const ambiguousCandidates = [
      post?.mediaUrl,
      post?.media,
      post?.mediaUrls?.[0],
      post?.url,
    ];
    for (const candidate of ambiguousCandidates) {
      const rawUrl = toMediaUrl(candidate);
      if (!rawUrl) continue;
      if (
        /(?:\.(?:avif|bmp|gif|jpe?g|png|webp)(?:[?#]|$)|\/image\/upload\/|^data:image\/)/i.test(
          rawUrl,
        )
      )
        continue;
      return resolveMediaUrl(rawUrl);
    }
    return "";
  }

  function getVideoUrl(post) {
    return getOptimizedPlaybackUrl(getOriginalVideoUrl(post));
  }

  function getPostImage(post, width = 1200) {
    const image = getPostImages(post)[0];

    if (!image) return "";

    // Preserve support for legacy Unsplash photo IDs.
    if (image.startsWith("photo-")) {
      return `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=85`;
    }

    return resolveMediaUrl(image);
  }

  // Show the saved thumbnail when available. If a video has no thumbnail,
  // render its first decoded frame as the Up next preview instead of a broken image.
  function UpNextThumbnail({ post, loading = "lazy", fetchPriority = "auto" }) {
    const [imageFailed, setImageFailed] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    const imageUrl = getPostImage(post, 320);
    const videoUrl = getVideoUrl(post);
    const showImage = Boolean(imageUrl) && !imageFailed;
    const showVideo =
      !showImage &&
      post?.mediaType !== "photo" &&
      post?.type !== "photo" &&
      Boolean(videoUrl) &&
      !videoFailed;

    return (
      <>
        {showImage && (
          <img
            src={imageUrl}
            alt=""
            loading={loading}
            decoding="async"
            fetchPriority={fetchPriority}
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {showVideo && (
          <video
            src={videoUrl}
            muted
            playsInline
            preload="none"
            crossOrigin="anonymous"
            onLoadedMetadata={(event) => {
              // Seek a tiny amount so the browser paints a representative frame.
              try {
                if (event.currentTarget.duration > 0.2)
                  event.currentTarget.currentTime = 0.1;
              } catch {
                // Some streaming formats do not allow seeking at this point.
              }
            }}
            onError={() => setVideoFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </>
    );
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const minutes = Math.floor(seconds / 60);

    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function formatCount(value) {
    const number = Number(value) || 0;

    if (number >= 1_000_000) {
      return `${(number / 1_000_000).toFixed(1).replace(/.0$/, "")}M`;
    }

    if (number >= 1_000) {
      return `${(number / 1_000).toFixed(1).replace(/.0$/, "")}K`;
    }

    return String(number);
  }

  function formatPostViews(post) {
    const value = post?.viewsCount ?? post?.views;

    if (value == null || value === "") return "— views";

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return "— views";
      if (/\bviews?\b/i.test(trimmed)) return trimmed;

      const numericValue = Number(trimmed);
      return Number.isFinite(numericValue)
        ? `${formatCount(numericValue)} views`
        : `${trimmed} views`;
    }

    return `${formatCount(value)} views`;
  }

  function getPostId(post) {
    return post?._id ?? post?.id;
  }

  function getPostLikeCount(post) {
    return Math.max(0, Number(post?.likesCount ?? post?.likes) || 0);
  }

  function DesktopVideoViewer({
    posts = [],
    initialPost,
    preservePostOrder = false,
    initialPostIndex = null,
    onBack,
  }) {
    const availablePosts = useMemo(
      () => posts.filter((post) => getPostId(post) != null),
      [posts],
    );

    const initialPostId = getPostId(initialPost);

    const matchingInitialPost = availablePosts.find(
      (post) => String(getPostId(post)) === String(initialPostId),
    );

    // Profile viewers preserve the supplied grid order. Other entry points keep
    // their existing selected-first shuffled behavior.
    const viewerPosts = useMemo(() => {
      if (preservePostOrder) {
        const containsInitial = availablePosts.some(
          (post) =>
            post === initialPost ||
            String(getPostId(post)) === String(initialPostId),
        );
        if (containsInitial) return availablePosts;
        if (!initialPost) return availablePosts;

        // Keep the profile sequence when ID shapes differ; don't move the
        // selected post to index zero, otherwise earlier posts disappear above.
        if (Number.isInteger(initialPostIndex) && initialPostIndex >= 0) {
          const ordered = [...availablePosts];
          const safeIndex = Math.min(initialPostIndex, ordered.length);
          if (safeIndex < ordered.length) ordered[safeIndex] = initialPost;
          else ordered.splice(safeIndex, 0, initialPost);
          return ordered;
        }

        return [initialPost, ...availablePosts];
      }

      if (initialPostId == null) return availablePosts;

      const selectedPost = matchingInitialPost || initialPost;
      if (!selectedPost) return availablePosts;

      const remainingPosts = availablePosts.filter(
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
      availablePosts,
      initialPost,
      initialPostId,
      matchingInitialPost,
      preservePostOrder,
      initialPostIndex,
    ]);

    // A stable key prevents effects from rerunning just because the parent
    // creates a fresh `posts` array on each render.
    const viewerPostIdsKey = viewerPosts
      .map((post) => String(getPostId(post)))
      .join("|");

    // Effects keyed by stable post IDs read the latest post objects through this ref.
    const viewerPostsRef = useRef(viewerPosts);

    useEffect(() => {
      viewerPostsRef.current = viewerPosts;
    }, [viewerPosts]);

    const firstPostId = initialPostId ?? getPostId(viewerPosts[0]);

    const [activeId, setActiveId] = useState(firstPostId);
    const [initialPlacementReady, setInitialPlacementReady] = useState(false);

    const [likedPosts, setLikedPosts] = useState({});

    const [bookmarkedPosts, setBookmarkedPosts] = useState({});
    const bookmarkRequestsRef = useRef(new Set());
    const userChangedBookmarksRef = useRef(new Set());

    const [likeCountOverrides, setLikeCountOverrides] = useState({});

    const [animatedLikePostId, setAnimatedLikePostId] = useState(null);

    const [followedCreators, setFollowedCreators] = useState({});

    const [photoIndexes, setPhotoIndexes] = useState({});

    const [, setVideoRatios] = useState({});

    const [muted, setMuted] = useState(() =>
      Boolean(getSavedPlaybackPreference("startMuted", true)),
    );

    const [paused, setPaused] = useState(false);
    const [playingVideoPostId, setPlayingVideoPostId] = useState(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [captionsEnabled, setCaptionsEnabled] = useState(false);

    const [qualityOptions, setQualityOptions] = useState([]);
    const [selectedQuality, setSelectedQuality] = useState("auto");
    const qualityControllerRef = useRef(null);
    const selectedQualityRef = useRef("auto");
    selectedQualityRef.current = selectedQuality;

    const [playbackFeedback, setPlaybackFeedback] = useState(null);

    const [progress, setProgress] = useState(0);

    const [duration, setDuration] = useState(0);

    const [currentTime, setCurrentTime] = useState(0);

    const [commentsOpen, setCommentsOpen] = useState(false);

    const [showCreatorOverlay, setShowCreatorOverlay] = useState(true);

    const creatorOverlayTimerRef = useRef(null);

    const feedRef = useRef(null);

    const videoRef = useRef(null);
    const playbackPositionsRef = useRef(new Map());

    const postRefs = useRef({});

    const playbackFeedbackTimerRef = useRef(null);

    const likeAnimationTimerRef = useRef(null);

    const likeRequestsRef = useRef(new Set());

    const likedPostsRef = useRef({});

    const userChangedLikesRef = useRef(new Set());

    const lastTapRef = useRef({ time: 0, postId: null, x: 0, y: 0 });

    const activeIndex = Math.max(
      0,

      viewerPosts.findIndex(
        (post) => String(getPostId(post)) === String(activeId),
      ),
    );
    const activeIndexRef = useRef(activeIndex);
    activeIndexRef.current = activeIndex;

    const activePost = viewerPosts[activeIndex];

    const activePostId = getPostId(activePost);
    useEffect(() => {
      // Keep the cover visible whenever the desktop viewer changes videos.
      setPlayingVideoPostId(null);
    }, [activeId]);
    const activeOriginalVideoUrl = getOriginalVideoUrl(activePost);
    const activePostIsPhoto = isPhotoMediaPost(activePost);
    const shouldPlayActiveVideoRef = useRef(!paused);
    shouldPlayActiveVideoRef.current = !paused;

    useEffect(() => {
      qualityControllerRef.current = null;
      setQualityOptions([]);

      if (!activePostId || activePostIsPhoto || !activeOriginalVideoUrl) {
        return undefined;
      }

      const video = videoRef.current;
      if (!video || !getCloudinaryHlsUrl(activeOriginalVideoUrl)) {
        return undefined;
      }

      return attachCloudinaryAdaptiveStream(
        video,
        activeOriginalVideoUrl,
        getOptimizedPlaybackUrl(activeOriginalVideoUrl),
        () => shouldPlayActiveVideoRef.current,
        () => setMuted(true),
        (levels) => {
          setQualityOptions(levels);
          if (selectedQualityRef.current !== "auto") {
            qualityControllerRef.current?.selectQuality(
              selectedQualityRef.current,
            );
          }
        },
        (controller) => {
          qualityControllerRef.current = controller;
          if (controller) {
            controller.selectQuality(selectedQualityRef.current);
          }
        },
        selectedQualityRef.current,
        playbackPositionsRef.current.get(String(activePostId)) || 0,
        (time) => {
          if (Number.isFinite(time) && time >= 0) {
            playbackPositionsRef.current.set(String(activePostId), time);
          }
        },
      );
    }, [activePostId, activeOriginalVideoUrl, activePostIsPhoto]);

    // Prewarm one upcoming video while the current video is playing. Rebuild
    // the observer after each active-index change so the next card is observed
    // anew even when it already intersects the root margin; without this, the
    // observer can skip it once and never notify again during a fast swipe.
    useEffect(() => {
      const feed = feedRef.current;
      if (!feed || typeof IntersectionObserver === "undefined") {
        return undefined;
      }

      const candidateByElement = new Map();
      viewerPosts.forEach((post, index) => {
        const element = postRefs.current[String(getPostId(post))];
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
            if (candidate.index !== currentIndex + 1) continue;

            observer.unobserve(entry.target);
            const nextPost =
              viewerPostsRef.current[candidate.index] || candidate.post;
            if (
              nextPost?.mediaType === "photo" ||
              nextPost?.mediaType === "image" ||
              nextPost?.type === "photo" ||
              nextPost?.type === "image" ||
              nextPost?.isImagePost === true ||
              nextPost?.isPhotoPost === true
            ) {
              continue;
            }

            const nextUrl = getOriginalVideoUrl(nextPost);
            if (getCloudinaryHlsUrl(nextUrl)) {
              preloadCloudinaryVideoStream(
                nextUrl,
                selectedQualityRef.current,
                { includeFirstSegment: false },
              );
            }
          }
        },
        {
          root: feed,
          rootMargin: "0px 0px 130% 0px",
          threshold: 0.01,
        },
      );

      candidateByElement.forEach(({ index }, element) => {
        if (index > activeIndex) observer.observe(element);
      });

      return () => observer.disconnect();
    }, [viewerPostIdsKey, activeIndex]);

    // Prepare next-video metadata early, but defer its first media segment until
    // the active stream has a healthy buffer so it cannot slow first playback.
    useEffect(() => {
      if (
        !activePostId ||
        String(playingVideoPostId) !== String(activePostId)
      ) {
        return undefined;
      }

      const activeVideo = videoRef.current;
      if (!activeVideo) return undefined;

      let nextUrl = "";
      for (
        let index = activeIndex + 1;
        index < viewerPosts.length;
        index += 1
      ) {
        const candidate = viewerPosts[index];
        const candidateType = String(
          candidate?.mediaType || candidate?.type || "",
        ).toLowerCase();
        if (
          ["photo", "image", "photos", "gallery"].includes(candidateType) ||
          candidate?.isImagePost === true ||
          candidate?.isPhotoPost === true
        )
          continue;
        const candidateUrl = getOriginalVideoUrl(candidate);
        if (getCloudinaryHlsUrl(candidateUrl)) {
          nextUrl = candidateUrl;
          break;
        }
      }
      if (!nextUrl) return undefined;

      preloadCloudinaryVideoStream(nextUrl, "auto", {
        includeFirstSegment: false,
      });

      let segmentPreloaded = false;
      let segmentPreloadInProgress = false;
      let lastSegmentPreloadAttemptAt = 0;
      const cleanupListeners = () => {
        activeVideo.removeEventListener("timeupdate", maybePreloadNextSegment);
        activeVideo.removeEventListener("progress", maybePreloadNextSegment);
        activeVideo.removeEventListener("playing", maybePreloadNextSegment);
      };
      const maybePreloadNextSegment = () => {
        if (
          segmentPreloaded ||
          segmentPreloadInProgress ||
          activeVideo.paused ||
          activeVideo.ended
        )
          return;

        // Failed speculative requests used to be marked complete before the
        // network request finished, so they never retried during this playback.
        const now = Date.now();
        if (now - lastSegmentPreloadAttemptAt < 2500) return;

        const currentTime = Number(activeVideo.currentTime) || 0;
        if (!activeVideo.buffered?.length) return;

        let bufferedAhead = 0;
        for (let index = 0; index < activeVideo.buffered.length; index += 1) {
          const start = activeVideo.buffered.start(index);
          const end = activeVideo.buffered.end(index);
          if (currentTime >= start - 0.15 && currentTime <= end + 0.15) {
            bufferedAhead = Math.max(0, end - currentTime);
            break;
          }
        }

        // Prepare early, but keep a small safety buffer for the active video.
        // Weak connections still get a little more headroom before competing.
        const minimumBufferedAhead = getNetworkPlaybackProfile().constrained
          ? 1.0
          : 0.45;
        if (bufferedAhead < minimumBufferedAhead) return;

        segmentPreloadInProgress = true;
        lastSegmentPreloadAttemptAt = now;
        Promise.resolve(
          preloadCloudinaryVideoStream(nextUrl, selectedQualityRef.current, {
            includeFirstSegment: true,
          }),
        )
          .then((prepared) => {
            if (prepared === true) {
              segmentPreloaded = true;
              cleanupListeners();
            }
          })
          .finally(() => {
            segmentPreloadInProgress = false;
          });
      };

      activeVideo.addEventListener("timeupdate", maybePreloadNextSegment);
      activeVideo.addEventListener("progress", maybePreloadNextSegment);
      activeVideo.addEventListener("playing", maybePreloadNextSegment);
      maybePreloadNextSegment();

      return cleanupListeners;
    }, [viewerPostIdsKey, activeIndex, activePostId, playingVideoPostId]);

    function changeVideoQuality(quality) {
      const value = quality === "auto" ? "auto" : String(quality);
      selectedQualityRef.current = value;
      setSelectedQuality(value);
      qualityControllerRef.current?.selectQuality(value);
    }

    const [comments, setComments] = useState([]);

    const [commentsLoading, setCommentsLoading] = useState(false);

    const [commentsError, setCommentsError] = useState("");

    // Restore saved bookmarks for the current viewer posts.
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
            viewerPostsRef.current.forEach((post) => {
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
    }, [viewerPostIdsKey]);

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

    // Restore the signed-in user's saved likes from the server.
    useEffect(() => {
      let cancelled = false;

      api.posts

        .getMyLikes()

        .then((response) => {
          if (cancelled) return;

          const likedIds = new Set(
            (Array.isArray(response?.postIds) ? response.postIds : []).map(
              String,
            ),
          );

          setLikedPosts((previous) => {
            const next = { ...previous, ...likedPostsRef.current };

            viewerPostsRef.current.forEach((post) => {
              const ids = [post.id, post._id].filter(Boolean).map(String);

              const key = String(getPostId(post));

              // Never let the initial server response overwrite a user's click.
              if (!userChangedLikesRef.current.has(key)) {
                next[key] = ids.some((id) => likedIds.has(id));
              }
            });

            likedPostsRef.current = next;

            return next;
          });
        })

        .catch((error) => {
          console.error(
            "Unable to restore liked posts:",

            error?.message || error,
          );
        });

      return () => {
        cancelled = true;
      };
    }, [viewerPostIdsKey]);

    // Load comments only while the desktop comments panel is open. Fetching a
    // complete thread on every video switch competes with HLS startup traffic.
    useEffect(() => {
      if (!activePostId || !commentsOpen) return undefined;

      let cancelled = false;

      // Defer loading-state updates so the effect starts the request first.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setCommentsLoading(true);
        setCommentsError("");
      });

      api.posts

        .getComments(activePostId)

        .then((result) => {
          if (!cancelled) {
            setComments(Array.isArray(result?.comments) ? result.comments : []);
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
    }, [activePostId, commentsOpen]);

    // Position the feed on the selected post before the browser paints.
    // Disable smooth scrolling for this initial placement so opening post 5 does
    // not visibly animate through posts 1–4 first.
    desktop_useLayoutEffect(() => {
      const initialId = initialPostId;
      const feed = feedRef.current;
      const postElement =
        initialId == null ? null : postRefs.current[String(initialId)];

      if (!feed || !postElement) return undefined;

      // Disable both smooth scrolling and snap while positioning the clicked
      // post. Re-enable snap only after its offset has been applied, so a post
      // opened from a grid never animates from the first post.
      feed.style.scrollBehavior = "auto";
      feed.style.scrollSnapType = "none";

      const feedTop = feed.getBoundingClientRect().top;
      const postTop = postElement.getBoundingClientRect().top;
      feed.scrollTop = Math.max(0, feed.scrollTop + postTop - feedTop);

      const selectedPost = viewerPostsRef.current.find(
        (post) => String(getPostId(post)) === String(initialId),
      );
      if (selectedPost) setActiveId(getPostId(selectedPost));
      setInitialPlacementReady(true);

      return undefined;
    }, [initialPostId, viewerPostIdsKey]);

    // Keep playback and mute state in sync with the active video.
    useEffect(() => {
      const video = videoRef.current;

      if (!video) return;

      video.muted = muted;

      if (paused) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    }, [activeId, paused, muted]);

    // Keep creator details visible briefly whenever a new video becomes active.
    const activePostMediaType = activePost?.mediaType;
    const activePostType = activePost?.type;

    useEffect(() => {
      if (creatorOverlayTimerRef.current) {
        window.clearTimeout(creatorOverlayTimerRef.current);

        creatorOverlayTimerRef.current = null;
      }

      let revealFrameId = window.requestAnimationFrame(() => {
        setShowCreatorOverlay(true);
        revealFrameId = null;
      });

      if (
        !activePostId ||
        activePostMediaType === "photo" ||
        activePostType === "photo"
      ) {
        return () => {
          if (revealFrameId != null) window.cancelAnimationFrame(revealFrameId);
        };
      }

      creatorOverlayTimerRef.current = window.setTimeout(() => {
        setShowCreatorOverlay(false);
        creatorOverlayTimerRef.current = null;
      }, 5000);

      return () => {
        if (revealFrameId != null) window.cancelAnimationFrame(revealFrameId);
        if (creatorOverlayTimerRef.current) {
          window.clearTimeout(creatorOverlayTimerRef.current);
          creatorOverlayTimerRef.current = null;
        }
      };
    }, [activeId, activePostId, activePostMediaType, activePostType]);

    // Reset playback controls after the active post changes.
    useEffect(() => {
      const frameId = window.requestAnimationFrame(() => {
        const resumeTime = Number(
          playbackPositionsRef.current.get(String(activeId)) || 0,
        );
        setProgress(0);
        setCurrentTime(Number.isFinite(resumeTime) ? resumeTime : 0);
        setDuration(0);
        setPaused(false);
        setPlaybackFeedback(null);
      });

      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
        playbackFeedbackTimerRef.current = null;
      }

      return () => window.cancelAnimationFrame(frameId);
    }, [activeId]);

    useEffect(() => {
      return () => {
        if (playbackFeedbackTimerRef.current) {
          window.clearTimeout(playbackFeedbackTimerRef.current);
        }

        if (likeAnimationTimerRef.current) {
          window.clearTimeout(likeAnimationTimerRef.current);
        }

        if (creatorOverlayTimerRef.current) {
          window.clearTimeout(creatorOverlayTimerRef.current);
        }
      };
    }, []);

    // Change the active post only when a slide is mostly visible.
    useEffect(() => {
      const feed = feedRef.current;

      if (!feed || typeof IntersectionObserver === "undefined") return;

      const observer = new IntersectionObserver(
        (entries) => {
          let mostVisibleEntry = null;

          for (const entry of entries) {
            if (
              entry.isIntersecting &&
              (!mostVisibleEntry ||
                entry.intersectionRatio > mostVisibleEntry.intersectionRatio)
            ) {
              mostVisibleEntry = entry;
            }
          }

          if (!mostVisibleEntry || mostVisibleEntry.intersectionRatio < 0.35) {
            return;
          }

          const postId = mostVisibleEntry.target.dataset.postId;

          if (postId == null) return;

          const matchingPost = viewerPostsRef.current.find(
            (post) => String(getPostId(post)) === postId,
          );

          if (matchingPost) {
            setActiveId((currentId) =>
              String(currentId) === String(getPostId(matchingPost))
                ? currentId
                : getPostId(matchingPost),
            );
          }
        },

        {
          root: feed,

          threshold: [0.35, 0.5, 0.6, 0.75, 0.9],
        },
      );

      Object.values(postRefs.current).forEach((element) => {
        if (element) observer.observe(element);
      });

      return () => observer.disconnect();
    }, [viewerPostIdsKey]);

    function selectPost(post) {
      if (!post) return;

      const postId = getPostId(post);

      const feed = feedRef.current;

      const element = postRefs.current[String(postId)];

      if (!feed || !element) return;

      setActiveId(postId);

      feed.scrollTo({
        top: element.offsetTop,

        behavior: "smooth",
      });
    }

    function revealCreatorOverlay() {
      setShowCreatorOverlay(true);

      if (creatorOverlayTimerRef.current) {
        window.clearTimeout(creatorOverlayTimerRef.current);
      }

      creatorOverlayTimerRef.current = window.setTimeout(() => {
        setShowCreatorOverlay(false);

        creatorOverlayTimerRef.current = null;
      }, 5000);
    }

    function showPlaybackFeedback(icon) {
      setPlaybackFeedback(icon);

      if (playbackFeedbackTimerRef.current) {
        window.clearTimeout(playbackFeedbackTimerRef.current);
      }

      playbackFeedbackTimerRef.current = window.setTimeout(() => {
        setPlaybackFeedback(null);

        playbackFeedbackTimerRef.current = null;
      }, 650);
    }

    function togglePlayback() {
      const video = videoRef.current;

      if (!video) return;

      if (video.paused) {
        video.play().catch(() => {});

        setPaused(false);

        showPlaybackFeedback("play");
      } else {
        video.pause();

        setPaused(true);

        showPlaybackFeedback("pause");
      }
    }

    function toggleCaptions() {
      const tracks = videoRef.current?.textTracks;
      if (!tracks || tracks.length === 0) {
        setCaptionsEnabled(false);
        return;
      }

      const nextEnabled = !Array.from(tracks).some(
        (track) => track.mode === "showing",
      );
      Array.from(tracks).forEach((track) => {
        track.mode = nextEnabled ? "showing" : "hidden";
      });
      setCaptionsEnabled(nextEnabled);
    }

    function handleTimeUpdate() {
      const video = videoRef.current;

      if (!video || !video.duration) return;

      setCurrentTime(video.currentTime);

      setDuration(video.duration);

      setProgress((video.currentTime / video.duration) * 100);
    }

    function handleSeek(event) {
      const video = videoRef.current;

      if (!video || !video.duration) return;

      const nextTime = Number(event.target.value);

      video.currentTime = nextTime;

      setCurrentTime(nextTime);

      setProgress((nextTime / video.duration) * 100);
    }

    // Update the heart/count on the first click, then serialize server changes.
    async function toggleLike(postId) {
      const post = viewerPosts.find(
        (item) => String(getPostId(item)) === String(postId),
      );

      const requestPostId = getPostId(post);

      if (!post || requestPostId == null) return;

      const key = String(requestPostId);

      userChangedLikesRef.current.add(key);

      // Read from a ref so fast clicks never depend on a stale React render.
      const wasLiked = Boolean(likedPostsRef.current[key] ?? likedPosts[key]);

      const nextLiked = !wasLiked;

      likedPostsRef.current = { ...likedPostsRef.current, [key]: nextLiked };

      setLikedPosts((previous) => ({ ...previous, [key]: nextLiked }));

      const currentCount = likeCountOverrides[key] ?? getPostLikeCount(post);

      setLikeCountOverrides((previous) => ({
        ...previous,

        [key]: Math.max(0, currentCount + (nextLiked ? 1 : -1)),
      }));

      // Don't drop a second click while a request is pending. The running loop
      // checks the latest desired state after each request completes.
      if (likeRequestsRef.current.has(key)) return;

      likeRequestsRef.current.add(key);

      let serverLiked = wasLiked;

      try {
        while (serverLiked !== Boolean(likedPostsRef.current[key])) {
          const desiredLiked = Boolean(likedPostsRef.current[key]);

          if (desiredLiked) {
            await api.posts.like(requestPostId);
          } else {
            await api.posts.unlike(requestPostId);
          }

          serverLiked = desiredLiked;
        }
      } catch (error) {
        console.error("Unable to update post like:", error?.message || error);
      } finally {
        likeRequestsRef.current.delete(key);
      }
    }

    function handleDoubleTapLike(postId, event) {
      event?.preventDefault?.();

      // A double tap adds a like but never removes an existing one.
      if (!likedPosts[String(postId)]) {
        void toggleLike(postId);
      }

      // Restart the animation so every double tap gets immediate feedback.
      setAnimatedLikePostId(null);

      if (likeAnimationTimerRef.current) {
        window.clearTimeout(likeAnimationTimerRef.current);
      }

      requestAnimationFrame(() => setAnimatedLikePostId(postId));

      likeAnimationTimerRef.current = window.setTimeout(() => {
        setAnimatedLikePostId(null);

        likeAnimationTimerRef.current = null;
      }, 700);
    }

    function handlePointerUp(postId, event) {
      // Use pointer events for reliable mobile/tablet double-tap detection.
      if (event.pointerType !== "touch") return;

      // Don't treat taps on interactive controls as taps on the media.
      if (event.target.closest("button, input, [role='button']")) {
        lastTapRef.current = { time: 0, postId: null, x: 0, y: 0 };

        return;
      }

      const now = Date.now();

      const key = String(postId);

      const lastTap = lastTapRef.current;

      const elapsed = now - lastTap.time;

      const distance = Math.hypot(
        event.clientX - lastTap.x,

        event.clientY - lastTap.y,
      );

      if (
        lastTap.postId === key &&
        elapsed > 0 &&
        elapsed < 350 &&
        distance < 72
      ) {
        lastTapRef.current = { time: 0, postId: null, x: 0, y: 0 };

        handleDoubleTapLike(postId, event);

        return;
      }

      lastTapRef.current = {
        time: now,

        postId: key,

        x: event.clientX,

        y: event.clientY,
      };
    }

    function toggleFollow(postId) {
      setFollowedCreators((previous) => ({
        ...previous,

        [postId]: !previous[postId],
      }));
    }

    async function submitComment(text) {
      if (!activePostId || !text?.trim()) {
        throw new Error("Choose a post and enter a comment first.");
      }

      const result = await api.posts.addComment(activePostId, text.trim());

      if (result?.comment) {
        setComments((previous) => [result.comment, ...previous]);
      }
    }

    function toggleFullscreen(postId) {
      const postElement = postRefs.current[String(postId)];

      const videoStage = postElement?.querySelector("[data-video-stage]");

      if (!videoStage) return;

      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        videoStage.requestFullscreen?.().catch(() => {});
      }
    }

    function handlePhotoScroll(postId, event) {
      const gallery = event.currentTarget;

      const index = Math.round(gallery.scrollLeft / gallery.clientWidth);

      setPhotoIndexes((previous) => ({
        ...previous,

        [postId]: index,
      }));
    }

    function goToPhoto(postId, index) {
      const gallery = document.getElementById(`photo-gallery-${postId}`);

      if (!gallery) return;

      gallery.scrollTo({
        left: index * gallery.clientWidth,

        behavior: "smooth",
      });
    }

    if (!activePost) return null;

    return (
      <div className="fixed inset-y-0 left-40 right-0 z-100 overflow-hidden bg-white text-black">
        <style>{`

        .spotli-double-tap-heart {

          animation: spotli-heart-pop 700ms cubic-bezier(.18, .89, .32, 1.28) both;

          transform-origin: center;

          filter: drop-shadow(0 0 18px rgba(255, 45, 74, .65));

        }

        .spotli-like-button:active .spotli-like-icon {

          transform: scale(1.35);

        }

        .spotli-like-icon {

          transition: transform 140ms ease, color 160ms ease, fill 160ms ease;

        }

        @keyframes spotli-heart-pop {

          0% { opacity: 0; transform: scale(.15) rotate(-24deg); }

          18% { opacity: 1; transform: scale(1.35) rotate(10deg); }

          36% { opacity: 1; transform: scale(.88) rotate(-6deg); }

          52% { opacity: 1; transform: scale(1.12) rotate(3deg); }

          68% { opacity: 1; transform: scale(1) rotate(0); }

          100% { opacity: 0; transform: scale(1.45) translateY(-14px); }

        }

        [data-video-stage]:fullscreen {

          position: fixed;

          inset: 0;

          width: 100vw;

          height: 100vh;

          max-width: none;

          overflow: hidden;

          background: #000;

        }

        [data-video-stage]:fullscreen video {

          position: absolute;

          inset: 0;

          width: 100%;

          height: 100%;

          max-width: none;

          transform: none;

          object-fit: contain;

        }

      `}</style>

        <div className="flex h-full min-h-0 flex-col">
          <div className="px-4 pt-4">
            <TopBar />
          </div>

          <div className="h-0 shrink-0" />

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,340px)] overflow-hidden">
            <section
              ref={feedRef}
              className="relative min-h-0 min-w-0 overflow-x-hidden overflow-y-auto snap-y snap-mandatory overscroll-y-contain bg-[#080808] scrollbar-none [&::-webkit-scrollbar]:hidden"
              style={{
                scrollBehavior: "auto",
                scrollSnapType: initialPlacementReady ? "y mandatory" : "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {viewerPosts.map((post) => {
                const postId = getPostId(post);

                const explicitThumbnail = resolveMediaUrl(
                  getExplicitPostThumbnail(post),
                );
                const videoUrl = getVideoUrl(post);
                const generatedVideoThumbnail = getCloudinaryVideoThumbnailUrl(
                  getOriginalVideoUrl(post),
                );
                const existingImageCandidate = getPostImage(post);
                const postThumbnail =
                  explicitThumbnail ||
                  generatedVideoThumbnail ||
                  (/\.(mp4|mov|m4v|webm|avi|mkv)(?:[?#]|$)/i.test(
                    existingImageCandidate,
                  )
                    ? ""
                    : existingImageCandidate);

                const photoSet = getPostImages(post);

                const postIsImage =
                  isPhotoMediaPost(post) || (!videoUrl && photoSet.length > 0);

                const photoIndex = photoIndexes[postId] || 0;

                const isActive = String(postId) === String(activeId);

                const isLiked = Boolean(likedPosts[String(postId)]);

                const displayedLikeCount =
                  likeCountOverrides[String(postId)] ?? getPostLikeCount(post);

                return (
                  <article
                    key={postId}
                    ref={(element) => {
                      if (element) {
                        postRefs.current[String(postId)] = element;
                      } else {
                        delete postRefs.current[String(postId)];
                      }
                    }}
                    data-post-id={String(postId)}
                    className="relative h-full min-h-full w-full snap-start snap-always overflow-hidden bg-[#080808]"
                    style={{
                      scrollSnapAlign: "start",

                      scrollSnapStop: "always",
                    }}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 scale-110 bg-cover bg-center blur-3xl"
                      style={{
                        backgroundImage:
                          isActive && postThumbnail
                            ? `url("${postThumbnail}")`
                            : "none",
                      }}
                    />

                    <div className="absolute inset-0 bg-black/60" />

                    <button
                      type="button"
                      onClick={onBack}
                      aria-label="Back to home"
                      className="absolute left-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white hover:bg-black/75"
                    >
                      <ArrowLeft size={19} />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFullscreen(postId)}
                      aria-label="Fullscreen"
                      className="absolute right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white hover:bg-black/75"
                    >
                      <Maximize size={17} />
                    </button>

                    <div
                      data-video-stage
                      onPointerDown={() => {
                        if (isActive && !postIsImage) revealCreatorOverlay();
                      }}
                      onMouseMove={() => {
                        if (isActive && !postIsImage) revealCreatorOverlay();
                      }}
                      onDoubleClick={(event) =>
                        handleDoubleTapLike(postId, event)
                      }
                      onPointerUp={(event) => handlePointerUp(postId, event)}
                      className="absolute inset-0 overflow-hidden bg-black touch-manipulation"
                    >
                      {postIsImage ? (
                        <>
                          <div
                            id={`photo-gallery-${postId}`}
                            onScroll={(event) =>
                              handlePhotoScroll(postId, event)
                            }
                            className="absolute inset-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scrollbar-none [&::-webkit-scrollbar]:hidden"
                          >
                            <div className="flex h-full w-full">
                              {photoSet.map((photo, index) => (
                                <div
                                  key={`${postId}-${photo}-${index}`}
                                  className="relative h-full w-full shrink-0 snap-center"
                                >
                                  <img
                                    src={getPostImage({ image: photo })}
                                    alt={`${post.caption} — photo ${index + 1}`}
                                    draggable="false"
                                    className="h-full w-full select-none object-contain"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {photoSet.length > 1 && (
                            <>
                              <span className="absolute right-5 top-5 z-30 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                                {photoIndex + 1} / {photoSet.length}
                              </span>

                              <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5">
                                {photoSet.map((_, index) => (
                                  <button
                                    key={`${postId}-dot-${index}`}
                                    type="button"
                                    aria-label={`Go to photo ${index + 1}`}
                                    aria-current={
                                      photoIndex === index ? "true" : undefined
                                    }
                                    onClick={() => goToPhoto(postId, index)}
                                    className={`h-1.5 rounded-full transition-all duration-200 ${
                                      photoIndex === index
                                        ? "w-4 bg-[#FF2D4A]"
                                        : "w-1.5 bg-white/60 hover:bg-white"
                                    }`}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      ) : isActive ? (
                        <>
                          <video
                            key={postId}
                            ref={videoRef}
                            src={
                              isActive &&
                              getCloudinaryHlsUrl(getOriginalVideoUrl(post))
                                ? undefined
                                : videoUrl || undefined
                            }
                            poster={postThumbnail || undefined}
                            autoPlay={!paused}
                            preload="auto"
                            muted={muted}
                            loop
                            playsInline
                            onClick={togglePlayback}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={(event) => {
                              const video = event.currentTarget;

                              setDuration(video.duration || 0);

                              setVideoRatios((previous) => ({
                                ...previous,

                                [postId]:
                                  video.videoWidth /
                                  Math.max(video.videoHeight, 1),
                              }));
                            }}
                            onError={(event) => {
                              console.error("Spotli video failed to load", {
                                postId,
                                src: event.currentTarget.currentSrc || videoUrl,
                                error:
                                  event.currentTarget.error?.message ||
                                  "Unknown media error",
                              });
                            }}
                            onPlay={() => setPaused(false)}
                            onPause={() => setPaused(true)}
                            onLoadedData={(event) => {
                              // Reveal the first decoded video frame as soon as it exists,
                              // instead of waiting for the later `playing` event. This
                              // avoids leaving the thumbnail over a frame that's already ready.
                              if (isActive && !paused) {
                                setPlayingVideoPostId(String(postId));
                              }
                            }}
                            onPlaying={() =>
                              setPlayingVideoPostId(String(postId))
                            }
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black">
                          {postThumbnail ? (
                            <img
                              src={postThumbnail}
                              alt=""
                              loading={isActive ? "eager" : "lazy"}
                              fetchPriority={isActive ? "high" : "low"}
                              decoding="async"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-white/70">
                              <Play size={36} />

                              <span className="text-xs">Scroll to play</span>
                            </div>
                          )}

                          <span className="absolute bottom-5 right-5 rounded-full bg-black/60 p-2 text-white">
                            <Play size={18} fill="currentColor" />
                          </span>
                        </div>
                      )}

                      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-linear-to-b from-black/15 to-transparent" />

                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-linear-to-t from-black/75 via-black/35 via-45% to-transparent" />

                      {String(animatedLikePostId) === String(postId) && (
                        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
                          <Heart
                            size={104}
                            fill="#FF2D4A"
                            color="#FF2D4A"
                            strokeWidth={1.5}
                            className="spotli-double-tap-heart drop-shadow-[0_8px_24px_rgba(255,45,74,0.45)]"
                          />
                        </div>
                      )}

                      {isActive && playbackFeedback && !postIsImage && (
                        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-sm">
                            {playbackFeedback === "play" ? (
                              <Play
                                size={30}
                                fill="currentColor"
                                className="ml-1"
                              />
                            ) : (
                              <Pause size={30} fill="currentColor" />
                            )}
                          </span>
                        </div>
                      )}

                      {(!isActive || postIsImage || showCreatorOverlay) && (
                        <div className="absolute bottom-14 left-4 right-16 z-20 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            {getCreatorAvatar(post) ? (
                              <img
                                src={getCreatorAvatar(post)}
                                alt={`${getCreatorName(post)}'s profile`}
                                loading="lazy"
                                decoding="async"
                                onError={(event) => {
                                  event.currentTarget.onerror = null;

                                  event.currentTarget.style.display = "none";
                                }}
                                className="h-7 w-7 shrink-0 rounded-full border-2 border-white object-cover shadow-lg"
                              />
                            ) : (
                              <span
                                aria-label={`${getCreatorName(post)}'s profile`}
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-white bg-[#FF2D4A] text-[10px] font-bold text-white shadow-lg"
                              >
                                {getCreatorName(post).charAt(0).toUpperCase()}
                              </span>
                            )}

                            <div className="min-w-0">
                              <p className="flex items-center gap-1 text-xs font-bold text-white">
                                {getCreatorName(post)}

                                <CheckCircle2
                                  size={12}
                                  className="text-sky-400"
                                />
                              </p>

                              <p className="text-xs font-medium text-white/90">
                                {post.time || "Recently"}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleFollow(postId)}
                              className="rounded-full border border-white px-2.5 py-1 text-[10px] font-bold text-white shadow-md backdrop-blur-sm"
                            >
                              {followedCreators[postId]
                                ? "Following"
                                : "Follow"}
                            </button>
                          </div>

                          {post.caption && (
                            <p className="mt-0.5 max-w-[92%] text-xs font-bold leading-snug text-white [text-shadow:0_2px_5px_rgba(0,0,0,0.95)]">
                              <MentionText
                                text={post.caption}
                                mentions={post.mentions}
                              />
                            </p>
                          )}

                          <p className="mt-1 text-[10px] font-medium text-white/90">
                            ♫ Original sound · {getCreatorName(post)}
                          </p>
                        </div>
                      )}

                      <aside className="absolute right-2 top-[56%] z-20 flex -translate-y-1/2 flex-col items-center gap-2 text-white">
                        <button
                          type="button"
                          onClick={() => toggleLike(postId)}
                          aria-label={isLiked ? "Unlike post" : "Like post"}
                          aria-pressed={isLiked}
                          className="spotli-like-button group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Heart
                              size={17}
                              fill={isLiked ? "#FF2D4A" : "none"}
                              color={isLiked ? "#FF2D4A" : "white"}
                              strokeWidth={2.2}
                              className="spotli-like-icon transition-colors duration-200"
                            />
                          </span>

                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                            {formatCount(displayedLikeCount)}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-label="Comments"
                          aria-pressed={commentsOpen}
                          onClick={() => setCommentsOpen((open) => !open)}
                          className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <MessageCircle size={15} />
                          </span>

                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                            {formatCount(
                              activePost?.commentsCount ?? comments.length,
                            )}
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-label="Share post"
                          onClick={() => {
                            if (navigator.share) {
                              navigator

                                .share({
                                  title: "Spotli",

                                  text: post.caption,

                                  url: window.location.href,
                                })

                                .catch(() => {});
                            } else if (navigator.clipboard) {
                              navigator.clipboard

                                .writeText(window.location.href)

                                .catch(() => {});
                            }
                          }}
                          className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Share2 size={14} />
                          </span>

                          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                            Share
                          </span>
                        </button>

                        <button
                          type="button"
                          aria-label="More options"
                          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <MoreVertical size={14} />
                        </button>

                        <button
                          type="button"
                          aria-label={
                            bookmarkedPosts[String(postId)]
                              ? "Remove bookmark"
                              : "Bookmark post"
                          }
                          aria-pressed={Boolean(
                            bookmarkedPosts[String(postId)],
                          )}
                          title={
                            bookmarkedPosts[String(postId)]
                              ? "Remove from saved posts"
                              : "Save post"
                          }
                          onClick={() => toggleBookmark(postId)}
                          className="group flex flex-col items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-md transition-colors group-hover:bg-black/85">
                            <Bookmark
                              size={16}
                              fill={
                                bookmarkedPosts[String(postId)]
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </span>
                          <span className="rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            Save
                          </span>
                        </button>
                      </aside>

                      {isActive && !postIsImage && (
                        <div className="absolute bottom-2 left-3 right-3 z-30 flex items-center gap-2 text-white">
                          <button
                            type="button"
                            onClick={togglePlayback}
                            aria-label={paused ? "Play" : "Pause"}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          >
                            {paused ? <Play size={16} /> : <Pause size={16} />}
                          </button>

                          <span className="whitespace-nowrap text-[11px]">
                            {formatTime(currentTime)} / {formatTime(duration)}
                          </span>

                          <input
                            aria-label="Video progress"
                            type="range"
                            min="0"
                            max={duration || 1}
                            step="0.1"
                            value={Math.min(currentTime, duration || 1)}
                            onChange={handleSeek}
                            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            style={{
                              background: `linear-gradient(to right, #FFFFFF ${progress}%, rgba(255,255,255,.4) ${progress}%)`,
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => setMuted((value) => !value)}
                            aria-label={muted ? "Unmute" : "Mute"}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          >
                            {muted ? (
                              <VolumeX size={16} />
                            ) : (
                              <Volume2 size={16} />
                            )}
                          </button>

                          <button
                            type="button"
                            aria-label={
                              captionsEnabled
                                ? "Turn captions off"
                                : "Turn captions on"
                            }
                            aria-pressed={captionsEnabled}
                            title="Toggle captions when available"
                            onClick={toggleCaptions}
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${captionsEnabled ? "bg-[#FF2D4A]/20 text-[#FF2D4A]" : "hover:bg-white/10"}`}
                          >
                            <Captions size={16} />
                          </button>

                          <div className="relative shrink-0">
                            <button
                              type="button"
                              aria-label="Playback settings"
                              aria-expanded={settingsOpen}
                              onClick={() => setSettingsOpen((open) => !open)}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            >
                              <Settings size={16} />
                            </button>
                            {settingsOpen && (
                              <div className="absolute bottom-8 right-0 z-50 max-h-64 min-w-36 overflow-y-auto rounded-lg bg-black/95 p-2 text-white shadow-xl">
                                <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-white/55">
                                  Video quality
                                </p>
                                <button
                                  type="button"
                                  aria-pressed={selectedQuality === "auto"}
                                  onClick={() => changeVideoQuality("auto")}
                                  className={`block w-full rounded px-3 py-2 text-left text-xs ${selectedQuality === "auto" ? "text-[#FF2D4A]" : "text-white"}`}
                                >
                                  Auto {selectedQuality === "auto" ? "✓" : ""}
                                </button>
                                {qualityOptions.length > 0 ? (
                                  [...qualityOptions]
                                    .reverse()
                                    .map((quality) => (
                                      <button
                                        key={quality.height}
                                        type="button"
                                        aria-pressed={
                                          selectedQuality ===
                                          String(quality.height)
                                        }
                                        onClick={() =>
                                          changeVideoQuality(quality.height)
                                        }
                                        className={`block w-full rounded px-3 py-2 text-left text-xs ${selectedQuality === String(quality.height) ? "text-[#FF2D4A]" : "text-white"}`}
                                      >
                                        {quality.label}{" "}
                                        {selectedQuality ===
                                        String(quality.height)
                                          ? "✓"
                                          : ""}
                                      </button>
                                    ))
                                ) : (
                                  <p className="px-3 py-2 text-[11px] leading-snug text-white/55">
                                    Manual quality is unavailable for this
                                    video/browser.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleFullscreen(postId)}
                            aria-label="Fullscreen"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          >
                            <Maximize size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-gray-100 bg-white">
              {!commentsOpen ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between px-3 py-3">
                    <h2 className="text-sm font-bold">Up next</h2>

                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      Autoplay
                      <input
                        type="checkbox"
                        defaultChecked
                        className="accent-[#FF2D4A]"
                      />
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 scrollbar-none [&::-webkit-scrollbar]:hidden">
                    {viewerPosts

                      .filter(
                        (post) =>
                          String(getPostId(post)) !== String(activePostId),
                      )

                      .map((post, index) => (
                        <button
                          key={getPostId(post)}
                          type="button"
                          onClick={() => selectPost(post)}
                          className="flex w-full gap-2 text-left"
                        >
                          <div className="relative h-14.5 w-25 shrink-0 overflow-hidden rounded-md bg-gray-100">
                            <UpNextThumbnail
                              post={post}
                              loading={index < 4 ? "eager" : "lazy"}
                              fetchPriority={index < 2 ? "high" : "auto"}
                            />

                            <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] text-white">
                              {post.duration || "0:30"}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-semibold leading-snug">
                              <MentionText
                                text={post.caption}
                                mentions={post.mentions}
                              />
                            </p>

                            <p className="mt-1 truncate text-xs text-gray-600">
                              {getCreatorName(post)}
                            </p>

                            <p className="mt-1 text-[10px] text-gray-500">
                              {formatPostViews(post)} ·{" "}
                              {post.time || "Recently"}
                            </p>
                          </div>

                          <MoreVertical
                            size={14}
                            className="shrink-0 text-gray-400"
                          />
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <div
                  id="desktop-comments"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <CommentSection
                    post={activePost}
                    comments={comments}
                    loading={commentsLoading}
                    error={commentsError}
                    onSubmit={submitComment}
                    onClose={() => setCommentsOpen(false)}
                    variant="panel"
                  />
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    );
  }

  return DesktopVideoViewer;
}
const DesktopViewerImplementation = createDesktopViewerImplementation();

/**
 * One responsive Spotli video viewer entry point. Mobile and tablet share the
 * same tablet implementation, handlers, playback state, and interaction logic.
 * Desktop continues to use its existing implementation.
 */
export default function VideoViewer({
  posts = [],
  initialPost,
  preservePostOrder = false,
  initialPostIndex = null,
  onBack,
}) {
  const getDevice = () => {
    if (typeof window === "undefined") return "mobile";
    if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
    if (window.matchMedia("(min-width: 768px)").matches) return "tablet";
    return "mobile";
  };
  const [device, setDevice] = useState(getDevice);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const tablet = window.matchMedia(
      "(min-width: 768px) and (max-width: 1023px)",
    );
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (desktop.matches) setDevice("desktop");
      else if (tablet.matches) setDevice("tablet");
      else setDevice("mobile");
    };
    update();
    mobile.addEventListener?.("change", update);
    tablet.addEventListener?.("change", update);
    desktop.addEventListener?.("change", update);
    return () => {
      mobile.removeEventListener?.("change", update);
      tablet.removeEventListener?.("change", update);
      desktop.removeEventListener?.("change", update);
    };
  }, []);

  const viewerProps = {
    posts,
    initialPost,
    preservePostOrder,
    initialPostIndex,
    onBack,
  };
  if (device === "desktop")
    return <DesktopViewerImplementation {...viewerProps} />;
  // Mobile and tablet intentionally share the same implementation.
  return <TabletViewerImplementation {...viewerProps} />;
}
