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
        author: data.author || "X User",
        username: data.screen_name || "",
        thumbnail:
          data.thumbnail ||
          (videoMedia.expanded_url ? videoMedia.expanded_url : ""),
        videos: [],
        // إضافة كائن الإحصائيات لمنع خطأ undefined في الفرونت إند
        statistics: {
          reply_count: data.statistics?.reply_count || 0,
          retweet_count: data.statistics?.retweet_count || 0,
          favorite_count: data.statistics?.favorite_count || 0,
        },
      };

      // Extract video variants
      if (Array.isArray(videoMedia.url)) {
        response.videos = videoMedia.url.map((v) => ({
          resolution: v.dimension || "unknown",
          url: v.url,
          width: v.width,
          height: v.height,
        }));
      } else if (typeof videoMedia.url === "string") {
        response.videos = [
          {
            resolution: "default",
            url: videoMedia.url,
          },
        ];
      }

      // If no videos but has variants in another place
      if (response.videos.length === 0 && videoMedia.videos) {
        response.videos = videoMedia.videos.map((v) => ({
          resolution: v.dimension || `${v.width}x${v.height}` || "default",
          url: v.url,
        }));
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
      },
      timeout: 10000,
    });

    const cheerio = require("cheerio");
    const $ = cheerio.load(response.data);

    // Try to find the download buttons
    const downloadBtns = $('a[href*="twitsave.com/download"]');
    if (downloadBtns.length === 0) {
      // Try another selector
      const anyDownload = $('a[href*="/download?"]').first();
      if (anyDownload.length === 0) return null;
    }

    const title =
      $("p.text-gray-600.dark\\:text-gray-300, div.p-4 p")
        .first()
        .text()
        .trim() || "X Video";
    const author =
      $("h3.font-bold, div.font-bold").first().text().trim() || "X User";
    const username =
      $("p.text-gray-500, div.text-gray-500").first().text().trim() || "";

    let thumbnail =
      $("div.aspect-video img, div.relative img").first().attr("src") || "";
    if (thumbnail && !thumbnail.startsWith("http")) {
      thumbnail = new URL(thumbnail, "https://twitsave.com").toString();
    }

    const videos = [];

    // Find all links containing twitsave download or query parameters
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (
        href &&
        (href.includes("twitsave.com/download") || href.includes("/download?"))
      ) {
        const text = $(el).text().trim();
        // Extract resolution if mentioned in text (e.g., "Download Video (720p)")
        const resMatch =
          text.match(/\((\d+p|\d+x\d+)\)/) || text.match(/(\d+p|\d+x\d+)/);
        const resolution = resMatch
          ? resMatch[1]
          : `Format ${videos.length + 1}`;

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
        // إرجاع قيم صفرية في حالة الـ Fallback
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
