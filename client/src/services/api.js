const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(endpoint, options = {}) {
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
    throw new Error(
      data.message || `Request failed with status ${response.status}`,
    );
  }

  return data;
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

    logout: () =>
      request("/auth/logout", {
        method: "POST",
      }),
  },

  posts: {
    getAll: (page = 1, limit = 20) =>
      request(`/posts?page=${page}&limit=${limit}`),

    create: (formData) =>
      request("/posts", {
        method: "POST",
        body: formData,
      }),

    like: (postId) =>
      request(`/posts/${postId}/like`, {
        method: "POST",
      }),

    unlike: (postId) =>
      request(`/posts/${postId}/like`, {
        method: "DELETE",
      }),

    getMyLikes: () => request("/posts/likes/me"),

    // Retrieve comments and replies for a post
    getComments: (postId) => request(`/posts/${postId}/comments`),

    // Add a top-level comment or a reply when parentCommentId is provided
    addComment: (postId, text, parentCommentId = null) =>
      request(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          text,
          ...(parentCommentId ? { parentCommentId } : {}),
        }),
      }),

    // Reply to an existing comment
    replyToComment: (postId, parentCommentId, text) =>
      request(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          text,
          parentCommentId,
        }),
      }),

    // Like a comment or reply
    likeComment: (postId, commentId) =>
      request(`/posts/${postId}/comments/${commentId}/like`, {
        method: "POST",
      }),

    // Unlike a comment or reply
    unlikeComment: (postId, commentId) =>
      request(`/posts/${postId}/comments/${commentId}/like`, {
        method: "DELETE",
      }),
  },
};

export default api;
