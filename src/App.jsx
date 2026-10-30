import { useState, useEffect, useCallback } from "react";
import "./index.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const CURRENT_YEAR = new Date().getFullYear();

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function detectPlatform(url) {
  if (!url) return null;
  if (/(?:instagram\.com|instagr\.am)/i.test(url)) return "instagram";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  return null;
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sanitizeFilename(name) {
  if (!name) return "reel";
  const clean = name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
  return clean || "reel";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const LinkIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const DownloadIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const ClearIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const InstagramIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("reeldown_theme");
    if (saved === "bright" || saved === "sombre") return saved;
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "sombre"
      : "bright";
  });

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("reeldown_theme", theme);
  }, [theme]);

  const detectedPlatform = detectPlatform(url);

  // Fetch handler
  const handleFetch = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setError(null);
    setResult(null);
    setLoading(true);
    setSelectedFormat(0);

    try {
      const res = await fetch(`${API_BASE}/api/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch video information.");
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleFetch();
  };

  // Paste handler
  const handlePaste = async () => {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrl(text);
          setError(null);
          setResult(null);
        }
      }
    } catch {
      // Clipboard access blocked by user or permissions policy
    }
  };

  // Clear handler
  const handleClear = () => {
    setUrl("");
    setError(null);
    setResult(null);
  };

  // Download handler
  const handleDownload = async () => {
    if (!result || downloading) return;
    const fmt = result.formats[selectedFormat];
    if (!fmt) return;

    setDownloading(true);
    try {
      const baseTitle = sanitizeFilename(result.title || "");
      const filename = `${baseTitle}_${fmt.quality}.${fmt.ext}`;
      const proxyUrl = `${API_BASE}/api/proxy-download?url=${encodeURIComponent(fmt.url)}&filename=${encodeURIComponent(filename)}`;

      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Download request failed.");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  // Copy direct link
  const handleCopyLink = async () => {
    const fmt = result?.formats?.[selectedFormat];
    if (!fmt?.url) return;

    try {
      await navigator.clipboard.writeText(fmt.url);
      setToastMessage("Stream URL copied to clipboard");
      setTimeout(() => setToastMessage(null), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="app-container">
      {/* Navigation */}
      <header className="navbar">
        <div className="navbar-inner">
          <a href="/" className="brand">
            <span className="brand-icon">
              <DownloadIcon />
            </span>
            <span>ReelDownloader</span>
          </a>

          <div className="nav-right">
            <div className="platform-indicators">
              <span className="platform-indicator-chip">Instagram</span>
              <span className="platform-indicator-chip">TikTok</span>
            </div>

            {/* Bright / Sombre Theme Switcher */}
            <div className="theme-toggle-group" role="group" aria-label="Theme selector">
              <button
                type="button"
                className={`theme-btn ${theme === "bright" ? "active" : ""}`}
                onClick={() => setTheme("bright")}
                title="Switch to Bright theme"
              >
                <SunIcon />
                <span>Bright</span>
              </button>
              <button
                type="button"
                className={`theme-btn ${theme === "sombre" ? "active" : ""}`}
                onClick={() => setTheme("sombre")}
                title="Switch to Sombre theme"
              >
                <MoonIcon />
                <span>Sombre</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="main-content">
        <section className="header-section">
          <h1 className="header-title">Download Reels & Videos</h1>
          <p className="header-subtitle">
            Paste any public Instagram or TikTok URL to save high-resolution media directly.
          </p>
        </section>

        {/* Input Bar */}
        <div className="input-container">
          <div className="input-bar">
            <span className="input-icon-lead">
              <LinkIcon />
            </span>

            <input
              type="url"
              className="url-input"
              placeholder="Paste Instagram Reel or TikTok link…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck="false"
            />

            <div className="input-actions">
              {detectedPlatform && (
                <span className={`detected-chip ${detectedPlatform}`}>
                  {detectedPlatform === "instagram" ? "Instagram" : "TikTok"}
                </span>
              )}

              {url ? (
                <button
                  type="button"
                  className="btn-icon-ghost"
                  onClick={handleClear}
                  title="Clear input"
                >
                  <ClearIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-paste"
                  onClick={handlePaste}
                  title="Paste from clipboard"
                >
                  Paste
                </button>
              )}

              <button
                type="button"
                className="btn-submit"
                onClick={handleFetch}
                disabled={loading || !url.trim()}
              >
                {loading ? (
                  <>
                    <span className="spinner light" />
                    <span>Fetching…</span>
                  </>
                ) : (
                  <span>Fetch</span>
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="input-hint">
          Supports Reels, single video posts, and TikToks. No watermark, sign-up, or installation.
        </p>

        {/* Loading State */}
        {loading && (
          <div className="state-card state-loading">
            <span className="spinner" />
            <span>Resolving media stream and metadata…</span>
          </div>
        )}

        {/* Error Alert */}
        {error && !loading && (
          <div className="state-card state-error" role="alert">
            <span className="state-error-icon">
              <AlertIcon />
            </span>
            <span>{error}</span>
          </div>
        )}

        {/* Result Card */}
        {result && !loading && (
          <div className="result-card">
            <div className="result-main">
              <div className="result-media">
                {result.thumbnail ? (
                  <img
                    src={result.thumbnail}
                    alt="Media preview"
                    className="result-thumb"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="result-thumb-placeholder">Video</div>
                )}
                {result.duration && (
                  <span className="result-duration-chip">
                    {formatDuration(result.duration)}
                  </span>
                )}
              </div>

              <div className="result-info">
                <div className="result-header-row">
                  <span className="result-badge">{result.platform}</span>
                  {result.author && (
                    <span className="result-author">{result.author}</span>
                  )}
                </div>

                <p className="result-title">{result.title}</p>
              </div>
            </div>

            {/* Quality Selector */}
            <div className="quality-section">
              <span className="section-label">Select Format</span>
              <div className="quality-options">
                {result.formats.map((fmt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`quality-btn ${selectedFormat === idx ? "active" : ""}`}
                    onClick={() => setSelectedFormat(idx)}
                  >
                    <span className="quality-btn-label">{fmt.label}</span>
                    <span className="quality-btn-meta">
                      {fmt.ext.toUpperCase()} • {fmt.quality}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="result-actions">
              <button
                type="button"
                className="btn-download-primary"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
                  <>
                    <span className="spinner light" />
                    <span>Preparing download…</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon />
                    <span>Download {result.formats[selectedFormat]?.quality || "File"}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-secondary-action"
                onClick={handleCopyLink}
                title="Copy stream URL"
              >
                <CopyIcon />
                <span>Copy Link</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Copy Toast Feedback */}
      {toastMessage && (
        <div className="copy-toast">
          <CheckIcon />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <p className="footer-credits">
            <span>Developed by</span>
            <a
              href="https://www.instagram.com/devwithmehdi/"
              target="_blank"
              rel="noopener noreferrer"
              className="creator-badge"
              title="Visit @devwithmehdi on Instagram"
            >
              <InstagramIcon />
              <span className="creator-handle">@devwithmehdi</span>
            </a>
          </p>
          <div className="footer-secondary">
            <span>© {CURRENT_YEAR} ReelDownloader</span>
            <span className="footer-sep">•</span>
            <span>Free personal utility</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
