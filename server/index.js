const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

app.use(cors());
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────────────────────

function detectPlatform(url) {
  if (/(?:instagram\.com|instagr\.am)/i.test(url)) return "instagram";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  return null;
}

// Shared browser-like headers
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Instagram ───────────────────────────────────────────────────────────────

async function fetchInstagramOembed(url) {
  try {
    const { data } = await axios.get(
      `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}`,
      {
        headers: HEADERS,
        timeout: 8000,
      }
    );
    return data;
  } catch {
    return null;
  }
}

async function fetchInstagramViaSaveInsta(canonicalUrl) {
  const pageRes = await axios.get("https://saveinsta.to/en/video", {
    headers: {
      ...HEADERS,
      Referer: "https://www.google.com/",
    },
    timeout: 10000,
  });

  const pageHtml = pageRes.data;
  const k_exp = pageHtml.match(/k_exp\s*=\s*"([^"]+)"/)?.[1];
  const k_token = pageHtml.match(/k_token\s*=\s*"([^"]+)"/)?.[1];

  if (!k_exp || !k_token) {
    throw new Error("Could not parse SaveInsta initialization tokens.");
  }

  const verifyRes = await axios.post(
    "https://saveinsta.to/api/userverify",
    new URLSearchParams({ url: canonicalUrl }).toString(),
    {
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: "https://saveinsta.to",
        Referer: "https://saveinsta.to/en/video",
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 10000,
    }
  );

  const cftoken = verifyRes.data?.token;
  if (!cftoken) {
    throw new Error("Failed to verify SaveInsta session.");
  }

  const searchRes = await axios.post(
    "https://saveinsta.to/api/ajaxSearch",
    new URLSearchParams({
      k_exp,
      k_token,
      q: canonicalUrl,
      t: "media",
      lang: "en",
      v: "v2",
      cftoken,
    }).toString(),
    {
      headers: {
        ...HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: "https://saveinsta.to",
        Referer: "https://saveinsta.to/en/video",
        "X-Requested-With": "XMLHttpRequest",
      },
      timeout: 15000,
    }
  );

  if (!searchRes.data?.data) {
    throw new Error("SaveInsta did not return media content.");
  }

  const $ = cheerio.load(searchRes.data.data);
  let videoUrl = null;
  let thumbUrl = null;

  $("a").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const href = $(el).attr("href");
    if ($(el).attr("video") !== undefined || text.includes("download video")) {
      videoUrl = href;
    }
    if (text.includes("download thumbnail")) {
      thumbUrl = href;
    }
  });

  if (!thumbUrl) {
    thumbUrl =
      $("img").first().attr("src") || $("img").first().attr("data-src") || null;
  }

  // If URL is an encoded JWT snapcdn link, extract the direct Instagram CDN stream
  if (videoUrl && videoUrl.includes("token=")) {
    try {
      const token = videoUrl.split("token=")[1].split("&")[0];
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString("utf8")
      );
      if (payload?.url) {
        videoUrl = payload.url;
      }
    } catch {
      // Keep original videoUrl
    }
  }

  if (thumbUrl && thumbUrl.includes("token=")) {
    try {
      const token = thumbUrl.split("token=")[1].split("&")[0];
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString("utf8")
      );
      if (payload?.url) {
        thumbUrl = payload.url;
      }
    } catch {
      // Keep original thumbUrl
    }
  }

  return { videoUrl, thumbUrl };
}

async function fetchInstagramViaEmbed(shortcode) {
  const embedUrls = [
    `https://www.instagram.com/p/${shortcode}/embed/`,
    `https://www.instagram.com/reel/${shortcode}/embed/`,
  ];

  for (const embedUrl of embedUrls) {
    try {
      const { data: html } = await axios.get(embedUrl, {
        headers: {
          ...HEADERS,
          Referer: "https://www.instagram.com/",
        },
        timeout: 10000,
      });

      const $ = cheerio.load(html);
      let videoUrl = $("video source").attr("src") || $("video").attr("src");

      if (!videoUrl) {
        const scriptTags = $("script")
          .map((_, el) => $(el).html())
          .get();
        for (const script of scriptTags) {
          const match = script.match(/"video_url":"([^"]+)"/);
          if (match) {
            videoUrl = match[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
            break;
          }
        }
      }

      if (videoUrl) {
        const thumbnail =
          $('meta[property="og:image"]').attr("content") ||
          $("img.EmbeddedMediaImage").attr("src") ||
          null;
        return { videoUrl, thumbUrl: thumbnail };
      }
    } catch {
      // Try next embed URL
    }
  }

  return { videoUrl: null, thumbUrl: null };
}

async function fetchInstagram(url) {
  // Extract shortcode from any Instagram URL format:
  // /reel/SHORTCODE/, /reels/SHORTCODE/, /p/SHORTCODE/, /tv/SHORTCODE/, /share/reel/SHORTCODE/
  const shortcodeMatch = url.match(
    /(?:instagram\.com|instagr\.am)\/(?:(?:share\/)?(?:reels?|p|tv|r))\/([A-Za-z0-9_-]+)/i
  );
  if (!shortcodeMatch) {
    throw new Error(
      "Invalid Instagram URL. Please paste a valid Reel or Post link."
    );
  }

  const shortcode = shortcodeMatch[1];
  const canonicalUrl = `https://www.instagram.com/reel/${shortcode}/`;

  // Fetch oEmbed in parallel for official metadata (title, author, thumbnail)
  const oembedPromise = fetchInstagramOembed(canonicalUrl);

  let media = { videoUrl: null, thumbUrl: null };

  // Primary strategy: SaveInsta
  try {
    media = await fetchInstagramViaSaveInsta(canonicalUrl);
  } catch (err) {
    console.warn("[Instagram] SaveInsta extraction failed, trying embed fallback:", err.message);
  }

  // Fallback strategy: Embed scraping
  if (!media.videoUrl) {
    try {
      media = await fetchInstagramViaEmbed(shortcode);
    } catch (err) {
      console.warn("[Instagram] Embed scraping fallback failed:", err.message);
    }
  }

  if (!media.videoUrl) {
    throw new Error(
      "Could not extract Instagram video. The reel may be private, restricted, or the URL is invalid."
    );
  }

  const oembed = await oembedPromise;
  const title = (oembed?.title || "Instagram Reel").trim();
  const author = oembed?.author_name ? `@${oembed.author_name}` : null;
  const thumbnail = media.thumbUrl || oembed?.thumbnail_url || null;

  return {
    platform: "instagram",
    title,
    author,
    thumbnail,
    formats: [
      {
        quality: "HD",
        label: "Best Available (MP4)",
        url: media.videoUrl,
        ext: "mp4",
        mimeType: "video/mp4",
      },
    ],
  };
}

// ─── TikTok ──────────────────────────────────────────────────────────────────

async function fetchTikTok(url) {
  // Use tikwm API — a well-known public scraper API for TikTok
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;

  const { data } = await axios.get(apiUrl, {
    headers: HEADERS,
    timeout: 20000,
  });

  if (!data || data.code !== 0 || !data.data) {
    throw new Error(
      "Could not fetch TikTok video. The video may be private or the URL is invalid."
    );
  }

  const d = data.data;

  const formats = [];

  if (d.play) {
    formats.push({
      quality: "HD",
      label: "HD (No Watermark)",
      url: d.play,
      ext: "mp4",
      mimeType: "video/mp4",
    });
  }

  if (d.wmplay) {
    formats.push({
      quality: "SD",
      label: "SD (With Watermark)",
      url: d.wmplay,
      ext: "mp4",
      mimeType: "video/mp4",
    });
  }

  if (d.music) {
    formats.push({
      quality: "audio",
      label: "Audio Only (MP3)",
      url: d.music,
      ext: "mp3",
      mimeType: "audio/mpeg",
    });
  }

  return {
    platform: "tiktok",
    title: d.title || "TikTok Video",
    thumbnail: d.cover || d.origin_cover || null,
    author: d.author ? `@${d.author.unique_id}` : null,
    duration: d.duration || null,
    formats,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /api/fetch — fetch video metadata
app.post("/api/fetch", async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "A valid URL is required." });
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({
      error:
        "Unsupported platform. Please provide an Instagram or TikTok URL.",
    });
  }

  try {
    let result;
    if (platform === "instagram") {
      result = await fetchInstagram(url);
    } else {
      result = await fetchTikTok(url);
    }
    return res.json(result);
  } catch (err) {
    console.error(`[${platform}] Error:`, err.message);
    return res.status(500).json({
      error: err.message || "Failed to process the URL. Please try again.",
    });
  }
});

// GET /api/proxy-download — stream file through backend to bypass CORS
app.get("/api/proxy-download", async (req, res) => {
  const { url, filename } = req.query;

  if (!url) {
    return res.status(400).json({ error: "URL parameter is required." });
  }

  const decodedUrl = decodeURIComponent(url);
  const isInstagram =
    decodedUrl.includes("instagram") ||
    decodedUrl.includes("cdninstagram") ||
    decodedUrl.includes("fbcdn.net");

  try {
    const response = await axios({
      method: "GET",
      url: decodedUrl,
      responseType: "stream",
      headers: {
        ...HEADERS,
        Referer: isInstagram
          ? "https://www.instagram.com/"
          : "https://www.tiktok.com/",
      },
      timeout: 60000,
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    const safeFilename = filename
      ? decodeURIComponent(filename)
      : "reeldownloader_video.mp4";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}"`
    );

    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    response.data.pipe(res);
  } catch (err) {
    console.error("[proxy-download] Error:", err.message);
    res.status(500).json({ error: "Failed to download the file." });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ReelDownloader API running at http://localhost:${PORT}`);
  });
}

module.exports = app;
