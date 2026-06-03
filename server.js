const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");

let TwitterDL;
try {
  const td = require("twitter-downloader");
  TwitterDL = td.TwitterDL;
} catch (e) {
  console.error("Failed to require twitter-downloader directly:", e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Fetch video info endpoint
app.get("/api/fetch", async (req, res) => {
  const tweetUrl = req.query.url;

  if (!tweetUrl) {
    return res.status(400).json({ success: false, error: "URL is required" });
  }

  // Basic Twitter URL regex validation (matches x.com and twitter.com)
  const twitterRegex =
    /https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
  if (!twitterRegex.test(tweetUrl)) {
    return res
      .status(400)
      .json({
        success: false,
        error:
          "Invalid X/Twitter Tweet URL. Make sure it is a valid status URL.",
      });
  }

  try {
    console.log(`Fetching media for: ${tweetUrl}`);
    let result;
    if (TwitterDL) {
      result = await TwitterDL(tweetUrl);
    } else {
      throw new Error("twitter-downloader package not available");
    }

    if (result && result.status === "success" && result.result) {
      const data = result.result;
      const mediaList = data.media || [];

      if (mediaList.length === 0) {
        console.log("TwitterDL found no media. Attempting TwitSave fallback scraping...");
        const fallbackResult = await fetchFromTwitsaveFallback(tweetUrl);
        if (fallbackResult) {
          return res.json(fallbackResult);
        }
        return res.status(404).json({
          success: false,
          error: "No media found by TwitterDL and fallback failed.",
        });
      }

      const videoMedia = mediaList.find(
        (m) => m.type === "video" || m.type === "animated_gif",
      );

      if (!videoMedia) {
        console.warn("No video or GIF found after processing.", {
          mediaList,
          dataMedia: data.media,
          resultStatus: result.status,
        });
        return res
          .status(404)
          .json({
            success: false,
            error: "No video or GIF found in this tweet.",
          });
      }

      console.log("Extracted video media:", JSON.stringify(videoMedia, null, 2));
      console.log("Video variants for download:", JSON.stringify(videoMedia.videos, null, 2));

      // Format the response
      const response = {
        success: true,
        id: data.id,
        title: data.description || "X Video",
        author: (data.author && data.author.username) ? data.author.username : "X User",
        username: (data.author && data.author.username) ? data.author.username : "",
        thumbnail:
          (videoMedia && videoMedia.cover) ||
          (data && data.thumbnail) ||
          "",
        videos: [],
        statistics: {
          reply_count: data.statistics?.reply_count || 0,
          retweet_count: data.statistics?.retweet_count || 0,
          favorite_count: data.statistics?.favorite_count || 0,
        },
      };

      // Extract video variants — twitter-downloader puts them in videoMedia.videos
      if (videoMedia && Array.isArray(videoMedia.videos)) {
        response.videos = videoMedia.videos.map((v) => ({
          resolution: v.quality || "unknown",
          url: v.url,
          bitrate: v.bitrate || 0,
        }));
      }

      // Fetch file sizes for each video via HEAD requests
      try {
        const videosWithSizes = await Promise.allSettled(
          response.videos.map(async (video) => {
            try {
              const headRes = await axios.head(video.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                  "Referer": video.url.includes("twitsave") ? "https://twitsave.com/" : "https://twitter.com/",
                },
                timeout: 8000,
                maxRedirects: 5,
              });
              const contentLength = headRes.headers["content-length"];
              return {
                ...video,
                fileSize: contentLength ? parseInt(contentLength, 10) : null,
              };
            } catch {
              return { ...video, fileSize: null };
            }
          })
        );
        response.videos = videosWithSizes
          .filter((r) => r.status === "fulfilled")
          .map((r) => r.value);
      } catch (sizeErr) {
        console.error("Error fetching file sizes:", sizeErr.message);
      }

      return res.json(response);
    } else {
      console.error("TwitterDL returned failure or was empty:", result);
      // Attempt fallback if TwitterDL returned error status
      console.log("Attempting TwitSave fallback scraping...");
      const fallbackResult = await fetchFromTwitsaveFallback(tweetUrl);
      if (fallbackResult) {
        return res.json(fallbackResult);
      }
      return res.status(400).json({
        success: false,
        error:
          (result && result.message) ||
          "Failed to fetch video details from X/Twitter.",
      });
    }
  } catch (error) {
    console.error("Error fetching Twitter video:", error);

    // Attempt fallback parsing if TwitterDL fails
    try {
      console.log("Attempting TwitSave fallback scraping...");
      const fallbackResult = await fetchFromTwitsaveFallback(tweetUrl);
      if (fallbackResult) {
        return res.json(fallbackResult);
      }
    } catch (fallbackError) {
      console.error("Fallback scraping failed too:", fallbackError);
    }

    return res.status(500).json({
      success: false,
      error:
        "Failed to retrieve video. This might be due to X/Twitter rate limits, age-restricted content, or server constraints. Please try again later.",
    });
  }
});

// TwitSave fallback scraper
async function fetchFromTwitsaveFallback(tweetUrl) {
  try {
    const targetUrl = `https://twitsave.com/info?url=${encodeURIComponent(tweetUrl)}`;
    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeout: 15000,
    });

    const cheerio = require("cheerio");
    const $ = cheerio.load(response.data);

    // Extract tweet text / title — try multiple selectors
    let title = "";
    // TwitSave puts the tweet text in various places
    title = $("p.mb-3, p.text-sm, .tweet-text, [class*='tweet']").first().text().trim();
    if (!title) {
      title = $("title").text().trim();
      // Page title is often "Download X video by @user — TwitSave", extract just the description
      if (title.includes(" — ")) title = title.split(" — ")[0];
      if (title.startsWith("Download ")) title = title.replace("Download ", "").replace(" video", "");
    }
    if (!title) title = "X Video";

    // Extract author name and username
    let author = "X User";
    let username = "";
    // Try to get from page heading or meta
    const headingText = $("h1, h2, h3").first().text().trim();
    const pageTitle = $("title").text().trim();
    // Page title format: "Download X video by @username — TwitSave"
    const byMatch = pageTitle.match(/by\s+(@[\w]+)/i);
    if (byMatch) {
      username = byMatch[1].replace("@", "");
      author = byMatch[1];
    }
    // Also try heading
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
      if (src.includes("pbs.twimg.com") || src.includes("video") || alt.includes("video") || alt.includes("tweet")) {
        if (!thumbnail) thumbnail = src;
      }
    });
    if (!thumbnail) {
      // First large image on the page
      thumbnail = $("img[src*='pbs.twimg.com'], img[src*='twimg.com']").first().attr("src") || "";
    }
    if (thumbnail && !thumbnail.startsWith("http")) {
      thumbnail = new URL(thumbnail, "https://twitsave.com").toString();
    }

    const videos = [];

    // Find all download links — broader selector coverage
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (
        href &&
        (href.includes("twitsave.com/download") ||
          href.includes("/download?") ||
          href.includes("download") && href.includes("twitsave"))
      ) {
        const text = $(el).text().trim();
        // Extract resolution from text like "Download Video (720p)" or "720p" or "360p"
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

        // Avoid duplicates
        if (!videos.some((v) => v.url === absoluteUrl)) {
          videos.push({
            resolution,
            url: absoluteUrl,
          });
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
        statistics: {
          reply_count: 0,
          retweet_count: 0,
          favorite_count: 0,
        },
      };
    }
  } catch (err) {
    console.error("Error in TwitSave fallback:", err.message);
  }
  return null;
}

// Proxy endpoint to force download with custom file name
app.get("/api/download", async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).send("URL is required");
  }

  try {
    console.log(`Streaming video from: ${videoUrl}`);
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (videoUrl.includes("t.co") || videoUrl.includes("twitter.com") || videoUrl.includes("twimg.com")) {
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

    // Set standard download headers
    res.setHeader("Content-Disposition", 'attachment; filename="x-video.mp4"');
    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "video/mp4",
    );

    // Pipe the response stream
    response.data.pipe(res);
  } catch (error) {
    console.error(`Error proxying video from ${videoUrl}:`, error.message);
    // Log the full error object for more details
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
    } else if (error.request) {
      console.error("Error request:", error.request);
    } else {
      console.error("Error message:", error.message);
    }
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
