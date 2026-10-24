const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const inFlightGetRequests = new Map();
const shortGetCache = new Map();
const NOTIFICATION_CACHE_TTL_MS = 3000;

function isNotificationListRequest(method, endpoint) {
  return method === "GET" && /^\/notifications(?:\?|$)/.test(endpoint);
}

function clearNotificationCache() {
  for (const key of shortGetCache.keys()) {
    if (key.startsWith("GET:/notifications")) shortGetCache.delete(key);
  }
}

async function request(endpoint, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const requestKey = `${method}:${endpoint}`;

  // Share concurrent GET requests for the same endpoint.
  if (method === "GET" && inFlightGetRequests.has(requestKey)) {
    return inFlightGetRequests.get(requestKey);
  }

  // React development effect replays can trigger the same notification query
  // immediately after the first request resolves. Reuse that result briefly.
  if (isNotificationListRequest(method, endpoint)) {
    const cached = shortGetCache.get(requestKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    if (cached) shortGetCache.delete(requestKey);
  }

  if (method !== "GET" && endpoint.startsWith("/notifications")) {
    clearNotificationCache();
  }
  if (["/auth/logout", "/auth/login", "/auth/register"].includes(endpoint)) {
    shortGetCache.clear();
  }

  const fetchPromise = (async () => {
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const error = new Error(
        data.message || `Request failed with status ${response.status}`,
      );
      error.status = response.status;
      error.code = data.code;
      throw error;
    }

    return data;
  })();

  if (method !== "GET") return fetchPromise;

  inFlightGetRequests.set(requestKey, fetchPromise);
  try {
    const data = await fetchPromise;
    if (isNotificationListRequest(method, endpoint)) {
      shortGetCache.set(requestKey, {
        data,
        expiresAt: Date.now() + NOTIFICATION_CACHE_TTL_MS,
      });
    }
    return data;
  } finally {
    if (inFlightGetRequests.get(requestKey) === fetchPromise) {
      inFlightGetRequests.delete(requestKey);
    }
  }
}

const api = {
  auth: {
    register: (userData) =>
      request("/auth/register", {
        method: "POST",
        body: JSON.stringify(userData),
      }),

    login: (credentials) =>
      request("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),

    me: () => request("/auth/me"),

    updateProfile: (data) =>
      request("/auth/me", {
        method: "PATCH",
        body:
          typeof FormData !== "undefined" && data instanceof FormData
            ? data
            : JSON.stringify(data),
      }),

    updatePrivacy: (isPrivate) =>
      request("/auth/me/privacy", {
        method: "PATCH",
        body: JSON.stringify({ isPrivate }),
      }),

    logout: () =>
      request("/auth/logout", {
        method: "POST",
      }),
  },

  users: {
    search: (query) => request(`/users/search?q=${encodeURIComponent(query)}`),

    getProfile: (userId) =>
      request(`/users/${encodeURIComponent(userId)}/profile`),

    getCreatorPosts: (userId, page = 1, limit = 20) =>
      request(
        `/users/${encodeURIComponent(userId)}/posts?page=${page}&limit=${limit}`,
      ),

    getFollowStats: (userId) =>
      request(`/users/${encodeURIComponent(userId)}/follow-stats`),

    getFollowList: (userId, type = "followers", page = 1, limit = 20) =>
      request(
        `/users/${encodeURIComponent(userId)}/follow-list?type=${encodeURIComponent(type)}&page=${page}&limit=${limit}`,
      ),

    follow: (userId) =>
      request(`/users/${encodeURIComponent(userId)}/follow`, {
        method: "POST",
      }),

    unfollow: (userId) =>
      request(`/users/${encodeURIComponent(userId)}/follow`, {
        method: "DELETE",
      }),

    getFollowRequests: (page = 1, limit = 20) =>
      request(`/users/follow-requests/me?page=${page}&limit=${limit}`),

    respondToFollowRequest: (followerId, action) =>
      request(`/users/me/follow-request/${encodeURIComponent(followerId)}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      }),
  },

  posts: {
    getAll: (page = 1, limit = 20) =>
      request(`/posts?page=${page}&limit=${limit}`),

    // Retained for backward compatibility.
    create: (formData) =>
      request("/posts", {
        method: "POST",
        body: formData,
      }),

    // Request a signed authorization for direct Cloudinary uploads.
    createUploadSignature: (details) =>
      request("/posts/upload-signature", {
        method: "POST",
        body: JSON.stringify(details),
      }),

    // Create a post after its media has been uploaded.
    createWithAssets: (postData) =>
      request("/posts", {
        method: "POST",
        body: JSON.stringify(postData),
      }),

    like: (postId) =>
      request(`/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
      }),

    unlike: (postId) =>
      request(`/posts/${encodeURIComponent(postId)}/like`, {
        method: "DELETE",
      }),

    getMyLikes: () => request("/posts/likes/me"),

    getComments: (postId) =>
      request(`/posts/${encodeURIComponent(postId)}/comments`),

    addComment: (postId, text) =>
      request(`/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
  },

  // Restored to fix PostGrid.jsx calling api.bookmarks.getMine().
  bookmarks: {
    getMine: () => request("/bookmarks"),

    add: (postId) =>
      request(`/bookmarks/${encodeURIComponent(postId)}`, {
        method: "POST",
      }),

    remove: (postId) =>
      request(`/bookmarks/${encodeURIComponent(postId)}`, {
        method: "DELETE",
      }),
  },

  notifications: {
    getMine: (page = 1, limit = 30) =>
      request(`/notifications?page=${page}&limit=${limit}`),

    markRead: (notificationId) =>
      request(`/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "PATCH",
      }),

    markAllRead: () =>
      request("/notifications/read-all", {
        method: "PATCH",
      }),
  },
};

export default api;
