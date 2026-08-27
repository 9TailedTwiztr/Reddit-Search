// ==========================================
// REDDIT ARCHIVE APP (Clean Native Build)
// ==========================================

const BACKENDS = {
  PULLPUSH: "pullpush",
  ARTIC_SHIFT: "artic_shift"
};

window.currentBackend = BACKENDS.ARTIC_SHIFT;
window.showImages = localStorage.getItem("showImages") !== "false";

// --- Status & Notifications ---
function setStatus(msg, type = "info", updateLast = false) {
  const errEl = document.getElementById("error");
  if (!errEl) return;

  if (updateLast && type === "loading") {
    const last = errEl.lastElementChild;
    if (last && last.querySelector(".status-icon.spinner")) {
      last.innerHTML = `<span class='status-icon spinner'></span>${msg}`;
      return;
    }
  }

  if (type === "success" || type === "error") {
    errEl.querySelectorAll(".status-icon.spinner").forEach(el => el.parentElement && el.parentElement.remove());
  }

  if (type === "error") {
    errEl.classList.add("error-active");
  } else {
    errEl.classList.remove("error-active");
  }

  let icon = "";
  if (type === "loading") icon = "<span class='status-icon spinner'></span>";
  else if (type === "success") icon = "<span class='status-icon success'>&#10003;</span>";
  else if (type === "error") icon = "<span class='status-icon error' style='font-family:monospace;font-weight:bold;'>&#215;</span>";

  const div = document.createElement("div");
  div.innerHTML = icon + msg;
  errEl.appendChild(div);
  errEl.style.display = errEl.childElementCount === 0 ? "none" : "";
}

// --- Date Formatter ---
function formatTimestamp(utcSeconds) {
  if (!utcSeconds) return "";
  const d = new Date(utcSeconds * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// --- Markdown Parser Helper ---
function parseMarkdown(text) {
  if (!text) return "";
  if (window.marked && window.marked.parse) {
    return window.marked.parse(text);
  }
  return text.replace(/\n/g, "<br/>");
}

// --- UI Templates ---
function renderSubmission(post) {
  const author = post.author || "[deleted]";
  const id = post.id || "";
  const numComments = post.num_comments ?? 0;
  const permalink = post.permalink || "";
  const score = post.score ?? 0;
  const subreddit = post.subreddit || "";
  const time = formatTimestamp(post.created_utc);
  const title = post.title || "";
  const selftext = parseMarkdown(post.selftext);
  const isNsfw = post.over_18 === true || post.over_18 === "true";
  const backend = window.currentBackend;

  let thumbnail = post.thumbnail || "";
  if (!thumbnail && post.url && /\.(jpg|png|gif|jpeg)$/i.test(post.url)) {
    thumbnail = post.url;
  }

  let imgHtml = "";
  if (window.showImages && thumbnail && !["default", "self", "nsfw"].includes(thumbnail)) {
    imgHtml = `<div class="thumbnail"><a href="${post.url || thumbnail}" target="_blank"><img src="${thumbnail}" alt="preview"/></a></div>`;
  }

  return `
    <div class="submissionclass ${isNsfw ? 'nsfw-post' : ''}">
      <div class="score">▲<br/>${score}</div>
      <div class="main">
        <div class="posted">
          <span>r/<a href="?subreddit=${subreddit}&backend=${backend}">${subreddit}</a></span>
          <span>• Posted by <a href="https://reddit.com/user/${author}" target="_blank">u/${author}</a></span>
          <span>• ${time}</span>
          ${isNsfw ? `<span class="nsfw-badge">NSFW</span>` : ''}
          ${permalink ? `<span>• <a href="https://reddit.com/${permalink}" target="_blank">Original Link ↗</a></span>` : ''}
        </div>
        <div class="title">
          <h3><a href="?comments=${id}&backend=${backend}" style="color:inherit;text-decoration:none;">${title}</a></h3>
        </div>
        ${selftext ? `<div class="post">${selftext}</div>` : ''}
        <div class="commentlink">
          <a href="?comments=${id}&backend=${backend}">💬 ${numComments} Comments</a>
          <a href="?mode=submissions&subreddit=&author=${author}&backend=${backend}">User Submissions</a>
          <a href="?mode=comments&author=${author}&backend=${backend}">User Comments</a>
        </div>
      </div>
      ${imgHtml}
    </div>
  `;
}

function renderComment(comment, highlightId = null) {
  const author = comment.author || "[deleted]";
  const id = comment.id || "";
  const score = comment.score ?? 0;
  const time = formatTimestamp(comment.created_utc);
  const body = parseMarkdown(comment.body);
  const backend = window.currentBackend;
  const isHighlighted = id === highlightId ? "post_highlight" : "post";
  const isDeleted = ["[deleted]", "[removed]"].includes(comment.body) ? "comment-red" : "";

  return `
    <div class="${isHighlighted} ${isDeleted}" id="${id}">
      <p class="comment_title">
        <a href="https://reddit.com/user/${author}" target="_blank"><b>u/${author}</b></a>
        <span> • ${score} points</span>
        <span> • ${time}</span>
        <span> • <a href="?mode=submissions&subreddit=&author=${author}&backend=${backend}">Submissions</a></span>
        <span> • <a href="?mode=comments&author=${author}&backend=${backend}">Comments</a></span>
      </p>
      <div class="comment_body">${body}</div>
      <div class="children" id="t1_${id}"></div>
    </div>
  `;
}

function renderProfileComment(comment) {
  const author = comment.author || "[deleted]";
  const id = comment.id || "";
  const linkId = (comment.link_id || "").replace(/^t3_/, "");
  const score = comment.score ?? 0;
  const time = formatTimestamp(comment.created_utc);
  const body = parseMarkdown(comment.body);
  const backend = window.currentBackend;

  return `
    <div class="post">
      <p class="comment_user">
        <a href="https://reddit.com/user/${author}" target="_blank"><b>u/${author}</b></a>
        <span> • ${score} points</span>
        <span> • ${time}</span>
      </p>
      <div class="comment_body">${body}</div>
      <div class="post_navigation" style="margin-top:8px;">
        <a href="?comments=${linkId}&id=${id}&backend=${backend}" style="font-size:12px;font-weight:600;color:#0079d3;">View Context ↗</a>
      </div>
    </div>
  `;
}

// --- Reddit User Profile Banner & 2x2 Stats Card ---
async function renderUserProfileBanner(author, currentMode, currentBackend, resultCount = 0) {
  const container = document.getElementById("content");
  if (!container || !author) return;

  const existing = document.getElementById("user-profile-banner");
  if (existing) existing.remove();

  const bannerDiv = document.createElement("div");
  bannerDiv.id = "user-profile-banner";
  bannerDiv.className = "profile-banner-wrapper";

  // Pick a consistent Reddit avatar based on username hash
  const avatarIndex = (author.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % 8) + 1;
  let avatarUrl = `https://www.redditstatic.com/avatars/defaults/v2/avatar_default_${avatarIndex}.png`;
  let karma = "Archived";
  let age = "Reddit User";
  let isNsfw = "No";

  // Try optional fetch; if Reddit CORS/403 blocks it, silently keep defaults
  try {
    const res = await fetch(`https://www.reddit.com/user/${author}/about.json`);
    if (res.ok) {
      const json = await res.json();
      const userData = json.data;
      if (userData) {
        karma = (userData.total_karma || (userData.link_karma + userData.comment_karma) || 0).toLocaleString();
        if (userData.created_utc) {
          const diffYears = ((Date.now() / 1000 - userData.created_utc) / 31536000).toFixed(1);
          age = diffYears >= 1 ? `${Math.floor(diffYears)} y` : `${Math.floor(diffYears * 12)} mo`;
        }
        isNsfw = userData.subreddit && userData.subreddit.over_18 ? "Yes" : "No";
        if (userData.snoovatar_img) avatarUrl = userData.snoovatar_img;
        else if (userData.icon_img) avatarUrl = userData.icon_img.split("?")[0];
      }
    }
  } catch (_) {
    // Expected on client-side due to Reddit API cross-origin restrictions
  }

  const isPosts = currentMode === "submissions" || !currentMode;
  const isComments = currentMode === "comments";

  bannerDiv.innerHTML = `
    <div class="profile-banner-left">
      <div class="profile-identity">
        <img class="profile-snoo-avatar" src="${avatarUrl}" alt="${author}" onerror="this.src='https://www.redditstatic.com/avatars/defaults/v2/avatar_default_1.png'"/>
        <div class="profile-titles">
          <h1>${author}</h1>
          <span class="u-name">u/${author}</span>
        </div>
      </div>
      <div class="profile-tabs">
        <a href="?author=${author}&backend=${currentBackend}" class="profile-tab-pill ${!currentMode ? 'active' : ''}">Overview</a>
        <a href="?mode=submissions&author=${author}&backend=${currentBackend}" class="profile-tab-pill ${isPosts && currentMode ? 'active' : ''}">Posts</a>
        <a href="?mode=comments&author=${author}&backend=${currentBackend}" class="profile-tab-pill ${isComments ? 'active' : ''}">Comments</a>
      </div>
    </div>
    <div class="profile-stats-card">
      <div class="profile-card-header">
        <span>${author}</span>
      </div>
      <a href="https://reddit.com/user/${author}" target="_blank" class="reddit-view-btn">
        💬 View on Reddit
      </a>
      <div class="stats-grid-2x2">
        <div class="stat-item">
          <span class="stat-value">${karma}</span>
          <span class="stat-label">Karma</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${resultCount ? `${resultCount}+` : age}</span>
          <span class="stat-label">${resultCount ? 'Contributions' : 'Reddit Age'}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${isNsfw}</span>
          <span class="stat-label">NSFW</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">Active</span>
          <span class="stat-label">Status</span>
        </div>
      </div>
    </div>
  `;

  container.prepend(bannerDiv);
}

// --- Pagination ---
function renderPagination(data, params, container) {
  if (!data || data.length === 0 || !container) return;
  const sort = params.get("sort") || "desc";
  const first = data[0].created_utc;
  const last = data[data.length - 1].created_utc;

  const nextBtn = document.createElement("a");
  nextBtn.className = "pagination-link";
  nextBtn.textContent = ">>";

  const prevBtn = document.createElement("a");
  prevBtn.className = "pagination-link";
  prevBtn.textContent = "<<";

  const nextParams = new URLSearchParams(window.location.search);
  const prevParams = new URLSearchParams(window.location.search);

  if (sort === "desc") {
    nextParams.set("before", last);
    prevParams.set("after", first);
    prevParams.delete("before");
  } else {
    nextParams.set("after", last);
    prevParams.set("before", first);
    prevParams.delete("after");
  }

  nextBtn.href = window.location.pathname + "?" + nextParams.toString();
  prevBtn.href = window.location.pathname + "?" + prevParams.toString();

  container.innerHTML = "";
  const pagDiv = document.createElement("div");
  pagDiv.className = "pagination-container";
  pagDiv.appendChild(prevBtn);
  pagDiv.appendChild(nextBtn);
  container.appendChild(pagDiv);
}

// --- API Service Handlers ---
const ArcticShift = {
  baseUrl: "https://arctic-shift.photon-reddit.com",
  
  async getSubmissions(params) {
    // Whitelist only valid Arctic Shift parameters
    const allowed = ["author", "subreddit", "title", "selftext", "query", "after", "before", "sort", "limit", "over_18", "spoiler", "author_flair_text", "link_flair_text", "url", "url_exact", "crosspost_parent_id"];
    const qParams = new URLSearchParams();

    params.forEach((v, k) => {
      if (k === "q" && v) qParams.set("query", v);
      else if (allowed.includes(k) && v) qParams.set(k, v);
    });
    if (!qParams.has("limit")) qParams.set("limit", "100");

    setStatus("Grabbing Submissions from Arctic Shift...", "loading");
    try {
      const res = await fetch(`${this.baseUrl}/api/posts/search?${qParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const posts = json.data || [];
      const content = document.getElementById("content");
      content.innerHTML = posts.length ? posts.map(renderSubmission).join("") : "<p style='padding:20px;text-align:center;color:#7c7c7c;'>No submissions found.</p>";
      setStatus("Done grabbing submissions from Arctic Shift", "success");
      renderPagination(posts, params, document.getElementById("paginate"));

      if (params.get("author")) {
        renderUserProfileBanner(params.get("author"), params.get("mode"), window.currentBackend, posts.length);
      }
    } catch (e) {
      setStatus(`Error from Arctic Shift: ${e.message}`, "error");
    }
  },

  async searchComments(params) {
    const allowed = ["author", "subreddit", "body", "after", "before", "sort", "limit", "author_flair_text", "link_id", "parent_id"];
    const qParams = new URLSearchParams();

    params.forEach((v, k) => {
      if (k === "q" && v) qParams.set("body", v);
      else if (allowed.includes(k) && v) qParams.set(k, v);
    });
    if (!qParams.has("limit")) qParams.set("limit", "100");

    setStatus("Searching comments from Arctic Shift...", "loading");
    try {
      const res = await fetch(`${this.baseUrl}/api/comments/search?${qParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const comments = json.data || [];
      const content = document.getElementById("content");
      content.innerHTML = comments.length ? comments.map(renderProfileComment).join("") : "<p style='padding:20px;text-align:center;color:#7c7c7c;'>No comments found.</p>";
      setStatus("Done searching comments from Arctic Shift", "success");
      renderPagination(comments, params, document.getElementById("paginate"));

      if (params.get("author")) {
        renderUserProfileBanner(params.get("author"), params.get("mode"), window.currentBackend, comments.length);
      }
    } catch (e) {
      setStatus(`Error from Arctic Shift: ${e.message}`, "error");
    }
  },

  async grabComments(postId, highlightId) {
    setStatus(`Grabbing post by ID: ${postId}...`, "loading");
    try {
      const postRes = await fetch(`${this.baseUrl}/api/posts/ids?ids=${postId}`);
      const postJson = await postRes.json();
      const post = (postJson.data && postJson.data[0]) ? postJson.data[0] : null;

      const content = document.getElementById("content");
      content.innerHTML = post ? renderSubmission(post) : "";
      content.innerHTML += `<div id="comments"></div>`;

      const treeRes = await fetch(`${this.baseUrl}/api/comments/tree?link_id=${postId}&limit=9999`);
      const treeJson = await treeRes.json();
      const comments = treeJson.data || [];

      const commentsContainer = document.getElementById("comments");
      commentsContainer.innerHTML = comments.map(c => renderComment(c.data, highlightId)).join("");

      if (highlightId) {
        const target = document.getElementById(highlightId);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
      setStatus("Done loading comments from Arctic Shift", "success");
    } catch (e) {
      setStatus(`Error loading thread: ${e.message}`, "error");
    }
  }
};

const Pullpush = {
  baseUrl: "https://api.pullpush.io/reddit/search",

  async getSubmissions(params) {
    const qParams = new URLSearchParams();
    params.forEach((v, k) => {
      if (!["backend", "mode", "comments", "id"].includes(k) && v) {
        qParams.append(k, v);
      }
    });

    setStatus("Grabbing Submissions from Pullpush...", "loading");
    try {
      const res = await fetch(`${this.baseUrl}/submission/?${qParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const posts = json.data || [];
      const content = document.getElementById("content");
      content.innerHTML = posts.length ? posts.map(renderSubmission).join("") : "<p style='padding:20px;text-align:center;color:#7c7c7c;'>No submissions found.</p>";
      setStatus("Done grabbing submissions from Pullpush", "success");
      renderPagination(posts, params, document.getElementById("paginate"));

      if (params.get("author")) {
        renderUserProfileBanner(params.get("author"), params.get("mode"), window.currentBackend, posts.length);
      }
    } catch (e) {
      setStatus(`Error from Pullpush: ${e.message}`, "error");
    }
  },

  async searchComments(params) {
    const qParams = new URLSearchParams();
    params.forEach((v, k) => {
      if (!["backend", "mode", "comments", "id"].includes(k) && v) {
        qParams.append(k, v);
      }
    });

    setStatus("Searching comments from Pullpush...", "loading");
    try {
      const res = await fetch(`${this.baseUrl}/comment/?${qParams.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const comments = json.data || [];
      const content = document.getElementById("content");
      content.innerHTML = comments.length ? comments.map(renderProfileComment).join("") : "<p style='padding:20px;text-align:center;color:#7c7c7c;'>No comments found.</p>";
      setStatus("Done searching comments from Pullpush", "success");
      renderPagination(comments, params, document.getElementById("paginate"));

      if (params.get("author")) {
        renderUserProfileBanner(params.get("author"), params.get("mode"), window.currentBackend, comments.length);
      }
    } catch (e) {
      setStatus(`Error from Pullpush: ${e.message}`, "error");
    }
  },

  async grabComments(postId, highlightId) {
    setStatus(`Grabbing post by ID: ${postId} from Pullpush...`, "loading");
    try {
      const postRes = await fetch(`${this.baseUrl}/submission/?ids=${postId}`);
      const postJson = await postRes.json();
      const post = (postJson.data && postJson.data[0]) ? postJson.data[0] : null;

      const content = document.getElementById("content");
      content.innerHTML = post ? renderSubmission(post) : "";
      content.innerHTML += `<div id="comments"></div>`;

      const commRes = await fetch(`${this.baseUrl}/comment/?link_id=${postId}&limit=500`);
      const commJson = await commRes.json();
      const comments = commJson.data || [];

      const commentsContainer = document.getElementById("comments");
      commentsContainer.innerHTML = comments.map(c => renderComment(c, highlightId)).join("");

      if (highlightId) {
        const target = document.getElementById(highlightId);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
      setStatus("Done loading comments from Pullpush", "success");
    } catch (e) {
      setStatus(`Error loading comments: ${e.message}`, "error");
    }
  }
};

// --- Dynamic Form Templates ---
function renderSearchForm(backend) {
  const container = document.getElementById("searchform");
  if (!container) return;

  const isArctic = backend === BACKENDS.ARTIC_SHIFT;
  container.innerHTML = `
    <form id="search_form" onsubmit="return window.handleSearchFormSubmit(event)">
      <div class="searchFlex">
        <label for="backend">
          <span class="label">Backend</span>
          <select id="backend" name="backend" onchange="window.switchBackend(this.value)">
            <option value="artic_shift" ${isArctic ? 'selected' : ''}>Arctic Shift</option>
            <option value="pullpush" ${!isArctic ? 'selected' : ''}>Pullpush</option>
          </select>
        </label>
        <label for="mode">
          <span class="label">Mode</span>
          <select id="mode" name="mode">
            <option value="submissions">Submissions</option>
            <option value="comments">Comments</option>
          </select>
        </label>
        <label for="author"><span class="label">Author</span><input type="text" name="author" id="author"></label>
        <label for="subreddit"><span class="label">Subreddit</span><input type="text" name="subreddit" id="subreddit"></label>
        <label for="q"><span class="label">Search Query</span><input type="text" name="q" id="q"></label>
        <label for="limit"><span class="label">Limit</span><input type="number" name="limit" id="limit" value="100" min="1" max="1000"></label>
        <label for="sort"><span class="label">Sort</span><select name="sort" id="sort"><option value="desc">Desc</option><option value="asc">Asc</option></select></label>
        <input type="submit" value="Search Archive">
      </div>
    </form>
  `;
}

// --- Global Form Events ---
window.switchBackend = function(backend) {
  window.currentBackend = backend;
  renderSearchForm(backend);
};

window.handleSearchFormSubmit = function(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = e.target || document.getElementById("search_form");
  const params = new URLSearchParams();

  Array.from(form.elements).forEach(el => {
    if (el.name && el.value && el.type !== "submit") {
      params.set(el.name, el.value);
    }
  });

  window.location.href = window.location.pathname + "?" + params.toString();
  return false;
};

// --- App Entry Point ---
window.onload = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const backend = urlParams.get("backend") || BACKENDS.ARTIC_SHIFT;
  window.currentBackend = backend;
  renderSearchForm(backend);

  // Populate form inputs from URL
  urlParams.forEach((val, key) => {
    const el = document.getElementById(key);
    if (el) el.value = val;
  });

  // Image toggle switch setup
  const imgToggle = document.getElementById("toggle-images-checkbox");
  const imgLabel = document.getElementById("toggle-images-label");
  if (imgToggle && imgLabel) {
    imgToggle.checked = window.showImages;
    imgLabel.textContent = window.showImages ? "Hide Images" : "Show Images";
    imgToggle.onchange = () => {
      window.showImages = imgToggle.checked;
      localStorage.setItem("showImages", window.showImages);
      imgLabel.textContent = window.showImages ? "Hide Images" : "Show Images";
      window.location.reload();
    };
  }

  // Route Dispatcher
  const threadMatch = window.location.pathname.match(/r\/[^\/]+\/comments\/(\w+)(?:\/[^\/]+)?\/(\w+)?/);
  if (threadMatch) {
    const postId = threadMatch[1];
    const commentId = threadMatch[2] || null;
    if (backend === BACKENDS.PULLPUSH) Pullpush.grabComments(postId, commentId);
    else ArcticShift.grabComments(postId, commentId);
    return;
  }

  const mode = urlParams.get("mode");
  if (urlParams.has("comments")) {
    const postId = urlParams.get("comments");
    const commentId = urlParams.get("id");
    if (backend === BACKENDS.PULLPUSH) Pullpush.grabComments(postId, commentId);
    else ArcticShift.grabComments(postId, commentId);
  } else if (mode === "comments") {
    if (backend === BACKENDS.PULLPUSH) Pullpush.searchComments(urlParams);
    else ArcticShift.searchComments(urlParams);
  } else if (mode === "submissions" || urlParams.has("subreddit") || urlParams.has("author") || urlParams.has("q")) {
    if (backend === BACKENDS.PULLPUSH) Pullpush.getSubmissions(urlParams);
    else ArcticShift.getSubmissions(urlParams);
  }
};
