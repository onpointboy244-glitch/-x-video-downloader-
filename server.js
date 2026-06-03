const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Extract tweet ID from various Twitter/X URL formats
function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

// Format bytes into human-readable file size
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return size.toFixed(unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
}

// Fetch file size via HEAD request
async function fetchFileSize(videoUrl) {
  try {
    const headRes = await axios.head(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": videoUrl.includes("twitsave")
          ? "https://twitsave.com/"
          : "https://twitter.com/",
      },
      timeout: 8000,
      maxRedirects: 5,
    });
    const contentLength = headRes.headers["content-length"];
    return contentLength ? parseInt(contentLength, 10) : null;
  } catch {
    return null;
  }
}

// Primary extraction using FxTwitter API (free, no auth required)
async function fetchFromFxTwitter(tweetId) {
  try {
    // Try fxtwitter first
    const r = await axios.get(
      `https://api.fxtwitter.com/i/status/${tweetId}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000,
      },
    );

    if (r.data && r.data.tweet) {
      const tweet = r.data.tweet;
      return {
        success: true,
        id: tweetId,
        title: tweet.text || "X Video",
        author: tweet.author?.name || "X User",
        username: tweet.author?.screen_name || "",
        thumbnail: tweet.thumbnail_url || "",
        mediaURLs: tweet.mediaURLs || [],
        mediaExtended: tweet.media_extended || [],
        statistics: {
          reply_count: tweet.replies || 0,
          retweet_count: tweet.retweets || 0,
          favorite_count: tweet.likes || 0,
        },
        hasMedia: tweet.hasMedia || false,
      };
    }
  } catch (err) {
    console.log(
      "FxTwitter failed:",
      err.response?.status,
      err.message,
    );
  }
  return null;
}

// Fallback: VxTwitter API
async function fetchFromVxTwitter(tweetId) {
  try {
    const r = await axios.get(
      `https://api.vxtwitter.com/i/status/${tweetId}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000,
      },
    );

    if (r.data && r.data.tweetID) {
      const tweet = r.data;
      return {
        success: true,
        id: tweetId,
        title: tweet.text || "X Video",
        author: tweet.user_name || "X User",
        username: tweet.user_screen_name || "",
        thumbnail: tweet.user_profile_image_url || "",
        mediaURLs: tweet.mediaURLs || [],
        mediaExtended: tweet.media_extended || [],
        statistics: {
          reply_count: tweet.replies || 0,
          retweet_count: tweet.retweets || 0,
          favorite_count: tweet.likes || 0,
        },
        hasMedia: tweet.hasMedia || false,
      };
    }
  } catch (err) {
    console.log(
      "VxTwitter failed:",
      err.response?.status,
      err.message,
    );
  }
  return null;
}

// Fallback: TwitSave scraper
async function fetchFromTwitsaveFallback(tweetUrl) {
  try {
    const targetUrl = `https://twitsave.com/info?url=${encodeURIComponent(tweetUrl)}`;
    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeout: 15000,
    });

    const cheerio = require("cheerio");
    const $ = cheerio.load(response.data);

    // Check if page says no video found
    const bodyText = $("body").text();
    if (
      bodyText.includes("could not find any video") ||
      bodyText.includes("private account")
    ) {
      return null;
    }

    // Extract tweet text / title
    let title = "";
    title = $("p.mb-3, p.text-sm, .tweet-text, [class*='tweet']")
      .first()
      .text()
      .trim();
    if (!title) {
      title = $("title").text().trim();
      if (title.includes(" — ")) title = title.split(" — ")[0];
      if (title.startsWith("Download "))
        title = title.replace("Download ", "").replace(" video", "");
    }
    if (!title) title = "X Video";

    // Extract author
    let author = "X User";
    let username = "";
    const headingText = $("h1, h2, h3").first().text().trim();
    const pageTitle = $("title").text().trim();
    const byMatch = pageTitle.match(/by\s+(@[\w]+)/i);
    if (byMatch) {
      username = byMatch[1].replace("@", "");
      author = byMatch[1];
    }
    if (!username && headingText) {
      const userMatch = headingText.match(/@([\w]+)/);
      if (userMatch) {
        username = userMatch[1];
        author = headingText;
      }
    }

    // Extract thumbnail
    let thumbnail = "";
    $("img").each((i, el) => {
      const src = $(el).attr("src") || "";
      const alt = $(el).attr("alt") || "";
      if (
        src.includes("pbs.twimg.com") ||
        src.includes("video") ||
        alt.includes("video") ||
        alt.includes("tweet")
      ) {
        if (!thumbnail) thumbnail = src;
      }
    });
    if (!thumbnail) {
      thumbnail =
        $("img[src*='pbs.twimg.com'], img[src*='twimg.com']")
          .first()
          .attr("src") || "";
    }
    if (thumbnail && !thumbnail.startsWith("http")) {
      thumbnail = new URL(thumbnail, "https://twitsave.com").toString();
    }

    const videos = [];
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (
        href &&
        (href.includes("twitsave.com/download") ||
          href.includes("/download?") ||
          (href.includes("download") && href.includes("twitsave")))
      ) {
        const text = $(el).text().trim();
        const resMatch =
          text.match(/\((\d+p|\d+x\d+)\)/) ||
          text.match(/(\d+p)/) ||
          text.match(/(\d+x\d+)/);
        const resolution = resMatch
          ? resMatch[1]
          : `Quality ${videos.length + 1}`;

        let absoluteUrl = href;
        if (href.startsWith("/")) {
          absoluteUrl = new URL(href, "https://twitsave.com").toString();
        }

        if (!videos.some((v) => v.url === absoluteUrl)) {
          videos.push({ resolution, url: absoluteUrl });
        }
      }
    });

    if (videos.length > 0) {
      return {
        success: true,
        id: tweetUrl.split("/").pop(),
        title,
        author,
        username,
        thumbnail,
        videos,
        statistics: { reply_count: 0, retweet_count: 0, favorite_count: 0 },
      };
    }
  } catch (err) {
    console.error("TwitSave fallback error:", err.message);
  }
  return null;
}

// Fetch video info endpoint
app.get("/api/fetch", async (req, res) => {
  const tweetUrl = req.query.url;

  if (!tweetUrl) {
    return res
      .status(400)
      .json({ success: false, error: "URL is required" });
  }

  // Basic Twitter URL regex validation
  const twitterRegex =
    /https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
  if (!twitterRegex.test(tweetUrl)) {
    return res.status(400).json({
      success: false,
      error: "Invalid X/Twitter Tweet URL. Make sure it is a valid status URL.",
    });
  }

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return res.status(400).json({
      success: false,
      error: "Could not extract tweet ID from URL.",
    });
  }

  try {
    console.log(`Fetching media for tweet ID: ${tweetId}`);

    // Method 1: Try FxTwitter API (free, no auth, returns video URLs + metadata)
    let fxResult = await fetchFromFxTwitter(tweetId);

    if (fxResult && fxResult.hasMedia && fxResult.mediaURLs.length > 0) {
      // Build video list from media URLs
      const videos = [];
      for (let i = 0; i < fxResult.mediaURLs.length; i++) {
        const mediaUrl = fxResult.mediaURLs[i];
        const mediaInfo = fxResult.mediaExtended[i] || {};

        // Determine resolution from media info
        let resolution = "unknown";
        if (mediaInfo.width && mediaInfo.height) {
          resolution = `${mediaInfo.width}x${mediaInfo.height}`;
        }

        // Fetch file size
        const fileSize = await fetchFileSize(mediaUrl);

        videos.push({
          resolution,
          url: mediaUrl,
          fileSize,
        });
      }

      return res.json({
        success: true,
        id: fxResult.id,
        title: fxResult.title,
        author: fxResult.author,
        username: fxResult.username,
        thumbnail: fxResult.thumbnail,
        videos,
        statistics: fxResult.statistics,
      });
    }

    // Method 2: Try VxTwitter API
    let vxResult = await fetchFromVxTwitter(tweetId);

    if (vxResult && vxResult.hasMedia && vxResult.mediaURLs.length > 0) {
      const videos = [];
      for (let i = 0; i < vxResult.mediaURLs.length; i++) {
        const mediaUrl = vxResult.mediaURLs[i];
        const mediaInfo = vxResult.mediaExtended[i] || {};

        let resolution = "unknown";
        if (mediaInfo.width && mediaInfo.height) {
          resolution = `${mediaInfo.width}x${mediaInfo.height}`;
        }

        const fileSize = await fetchFileSize(mediaUrl);

        videos.push({
          resolution,
          url: mediaUrl,
          fileSize,
        });
      }

      return res.json({
        success: true,
        id: vxResult.id,
        title: vxResult.title,
        author: vxResult.author,
        username: vxResult.username,
        thumbnail: vxResult.thumbnail,
        videos,
        statistics: vxResult.statistics,
      });
    }

    // Method 3: If APIs returned tweet data but no media, return what we have
    // (tweet might not have video, or video might be in a different format)
    if (fxResult && !fxResult.hasMedia) {
      return res.status(404).json({
        success: false,
        error:
          "This tweet does not contain a video. Only video tweets are supported.",
      });
    }

    // Method 4: TwitSave fallback
    console.log("Trying TwitSave fallback...");
    const twitsaveResult = await fetchFromTwitsaveFallback(tweetUrl);
    if (twitsaveResult) {
      // Fetch file sizes for TwitSave videos
      for (const video of twitsaveResult.videos) {
        video.fileSize = await fetchFileSize(video.url);
      }
      return res.json(twitsaveResult);
    }

    return res.status(404).json({
      success: false,
      error: "Could not extract video from this tweet. The tweet may not contain a video, or it may be from a private account.",
    });
  } catch (error) {
    console.error("Error fetching Twitter video:", error);
    return res.status(500).json({
      success: false,
      error:
        "Failed to retrieve video. This might be due to X/Twitter rate limits or server constraints. Please try again later.",
    });
  }
});

// Proxy endpoint to force download with custom file name
app.get("/api/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send("URL is required");
  }

  try {
    console.log(`Streaming video from: ${videoUrl}`);
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (
      videoUrl.includes("t.co") ||
      videoUrl.includes("twitter.com") ||
      videoUrl.includes("x.com") ||
      videoUrl.includes("twimg.com")
    ) {
      headers["Referer"] = "https://twitter.com/";
    } else if (videoUrl.includes("twitsave.com")) {
      headers["Referer"] = "https://twitsave.com/";
    }

    const response = await axios({
      method: "get",
      url: videoUrl,
      responseType: "stream",
      headers: headers,
    });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="x-video.mp4"',
    );
    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "video/mp4",
    );

    response.data.pipe(res);
  } catch (error) {
    console.error(`Error proxying video from ${videoUrl}:`, error.message);
    res
      .status(500)
      .send(
        "Failed to download video file. The direct link might be expired or restricted.",
      );
  }
});

// Fallback all routes to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
