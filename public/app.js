document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const downloadForm = document.getElementById("download-form");
  const tweetUrlInput = document.getElementById("tweet-url");
  const btnFetch = document.getElementById("btn-fetch");
  const loaderContainer = document.getElementById("loader-container");
  const errorContainer = document.getElementById("error-container");
  const errorMessage = document.getElementById("error-message");
  const resultContainer = document.getElementById("result-container");

  // Result elements
  const authorName = document.getElementById("tweet-author-name");
  const authorHandle = document.getElementById("tweet-author-handle");
  const tweetDescription = document.getElementById("tweet-description");
  const videoThumbnail = document.getElementById("video-thumbnail");
  const downloadLinksList = document.getElementById("download-links-list");

  // FAQ Accordion logic
  const faqQuestions = document.querySelectorAll(".faq-question");
  faqQuestions.forEach((question) => {
    question.addEventListener("click", () => {
      const currentItem = question.parentElement;
      const isActive = currentItem.classList.contains("active");

      // Close all other items
      document.querySelectorAll(".faq-item").forEach((item) => {
        item.classList.remove("active");
      });

      // Toggle current item
      if (!isActive) {
        currentItem.classList.add("active");
      }
    });
  });

  // Smooth scroll active state highlighting
  const sections = document.querySelectorAll("section");
  const navLinks = document.querySelectorAll(".nav-link");

  window.addEventListener("scroll", () => {
    let current = "";
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (scrollPos >= sectionTop - 120) {
        current = section.getAttribute("id");
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href").substring(1) === current) {
        link.classList.add("active");
      }
    });
  });

  // Format bytes into human-readable file size
  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return size.toFixed(unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
  }

  // Full-page ad overlay — loads ad script properly so it executes
  function showAdOverlay() {
    // Create a proper script element that the browser will execute
    const adScript = document.createElement("script");
    adScript.src =
      "https://pl29594598.effectivecpmnetwork.com/54/e6/7c/54e67c6cc1e1c3c1588c33167d55f5f3.js";
    adScript.async = true;
    document.body.appendChild(adScript);

    // Create clickable overlay on top of everything
    const overlay = document.createElement("div");
    overlay.id = "ad-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 99999;
      background: transparent;
      cursor: pointer;
    `;
    document.body.appendChild(overlay);

    // Remove overlay after 6 seconds so user can interact with results
    setTimeout(() => {
      overlay.remove();
      adScript.remove();
    }, 6000);
  }

  // Handle Form Submission
  downloadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const tweetUrl = tweetUrlInput.value.trim();
    if (!tweetUrl) return;

    // Reset UI states
    resetUI();
    showLoader(true);
    btnFetch.disabled = true;

    // Show full-page ad on extract
    showAdOverlay();

    try {
      console.log(`Sending API request to fetch info for: ${tweetUrl}`);
      const response = await fetch(
        `/api/fetch?url=${encodeURIComponent(tweetUrl)}`,
      );
      const data = await response.json();

      if (response.ok && data.success) {
        displayResults(data);
      } else {
        showError(
          data.error ||
            "Failed to extract video links. Please verify the URL and try again.",
        );
      }
    } catch (err) {
      console.error("Fetch request error:", err);
      showError(
        "Unable to connect to the downloader service. Please check your internet connection and try again.",
      );
    } finally {
      showLoader(false);
      btnFetch.disabled = false;
    }
  });

  // Determine quality tier class for badge coloring
  function getQualityClass(label) {
    if (!label) return null;
    const lower = label.toLowerCase();
    if (lower.includes("720") || lower.includes("1080") || lower.includes("2160")) return "hq";
    if (lower.includes("480")) return "mq";
    if (lower.includes("360") || lower.includes("240") || lower.includes("144")) return "lq";
    return null;
  }

  // Format duration in seconds to mm:ss
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Display results in the DOM
  function displayResults(data) {
    // Set text contents — author is the display name, username is the handle
    authorName.textContent = data.author || "X User";
    authorHandle.textContent = data.username ? `@${data.username}` : "";

    // Set tweet description and statistics
    const tweetDescriptionElement =
      document.getElementById("tweet-description");
    if (data.title) {
      tweetDescriptionElement.innerHTML = `
        <span class="tweet-caption">${data.title}</span>
        <div class="tweet-stats">
          <span class="reply-count">${data?.statistics?.reply_count || 0} replies</span>
          <span class="retweet-count">${data?.statistics?.retweet_count || 0} retweets</span>
          <span class="favorite-count">${data?.statistics?.favorite_count || 0} likes</span>
        </div>
      `;
    } else {
      tweetDescriptionElement.innerHTML = `
        <span class="tweet-caption">Video Post</span>
        <div class="tweet-stats">
          <span class="reply-count">0 replies</span>
          <span class="retweet-count">0 retweets</span>
          <span class="favorite-count">0 likes</span>
        </div>
      `;
    }

    // Build download buttons
    downloadLinksList.innerHTML = "";

    // New format: mediaGroups (one per video in the tweet)
    if (data.mediaGroups && data.mediaGroups.length > 0) {
      data.mediaGroups.forEach((group) => {
        // Create a group section for this video
        const groupSection = document.createElement("div");
        groupSection.className = "media-group";

        // Group header with thumbnail + video label
        const groupHeader = document.createElement("div");
        groupHeader.className = "media-group-header";

        const thumbImg = document.createElement("img");
        thumbImg.className = "media-group-thumb";
        thumbImg.alt = `Video ${group.index} thumbnail`;
        thumbImg.src = group.thumbnail || data.thumbnail || "";

        const groupInfo = document.createElement("div");
        groupInfo.className = "media-group-info";
        const durationStr = formatDuration(group.duration);
        groupInfo.innerHTML = `
          <span class="media-group-label">Video ${group.index}${data.mediaCount > 1 ? ` of ${data.mediaCount}` : ""}</span>
          ${durationStr ? `<span class="media-group-duration"><i class="fa-regular fa-clock"></i> ${durationStr}</span>` : ""}
        `;

        groupHeader.appendChild(thumbImg);
        groupHeader.appendChild(groupInfo);
        groupSection.appendChild(groupHeader);

        // Sort variants by resolution descending
        const sortedVariants = [...group.variants].sort((a, b) => {
          const getResValue = (res) => {
            const match = res.match(/(\d+)/);
            return match ? parseInt(match[0], 10) : 0;
          };
          return getResValue(b.resolution) - getResValue(a.resolution);
        });

        // Download items for this video
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "media-group-items";

        sortedVariants.forEach((video) => {
          const itemDiv = document.createElement("div");
          itemDiv.className = "download-item";

          // Quality info section
          const qualityDiv = document.createElement("div");
          qualityDiv.className = "download-quality";

          const badge = document.createElement("span");
          badge.className = "quality-badge";
          let displayRes = video.qualityLabel || video.resolution;
          if (displayRes && displayRes !== "unknown" && !video.qualityLabel) {
            const dimMatch = displayRes.match(/^(\d+)x(\d+)$/);
            if (dimMatch) {
              displayRes = `${dimMatch[2]}p`;
            }
          }
          badge.textContent = (displayRes || "N/A").toUpperCase();

          // Add quality-tier color class
          const qualityClass = getQualityClass(video.qualityLabel || video.resolution);
          if (qualityClass) {
            badge.classList.add(qualityClass);
          }

          // File type and size info
          const infoSpan = document.createElement("span");
          infoSpan.className = "file-type";
          const sizeStr = video.fileSize ? formatFileSize(video.fileSize) : "";
          infoSpan.textContent = sizeStr ? `MP4 • ${sizeStr}` : "MP4 (Video)";

          qualityDiv.appendChild(badge);
          qualityDiv.appendChild(infoSpan);

          // Action button
          const downloadBtn = document.createElement("a");
          downloadBtn.className = "btn-download-action";
          downloadBtn.href = `/api/download?url=${encodeURIComponent(video.url)}`;
          downloadBtn.target = "_blank";
          downloadBtn.innerHTML = `
            <span>Download</span>
            <i class="fa-solid fa-arrow-down-to-bracket"></i>
          `;

          itemDiv.appendChild(qualityDiv);
          itemDiv.appendChild(downloadBtn);

          itemsContainer.appendChild(itemDiv);
        });

        groupSection.appendChild(itemsContainer);
        downloadLinksList.appendChild(groupSection);
      });
    }
    // Legacy fallback: flat videos array (VxTwitter / TwitSave)
    else if (data.videos && data.videos.length > 0) {
      // Set thumbnail for single-video tweets
      if (data.thumbnail) {
        videoThumbnail.src = data.thumbnail;
        videoThumbnail.classList.remove("hidden");
      } else {
        videoThumbnail.src = "";
        videoThumbnail.classList.add("hidden");
      }

      const sortedVideos = [...data.videos].sort((a, b) => {
        const getResValue = (res) => {
          const match = res.match(/(\d+)/);
          return match ? parseInt(match[0], 10) : 0;
        };
        return getResValue(b.resolution) - getResValue(a.resolution);
      });

      sortedVideos.forEach((video) => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "download-item";

        const qualityDiv = document.createElement("div");
        qualityDiv.className = "download-quality";

        const badge = document.createElement("span");
        badge.className = "quality-badge";
        let displayRes = video.qualityLabel || video.resolution;
        if (displayRes && displayRes !== "unknown" && !video.qualityLabel) {
          const dimMatch = displayRes.match(/^(\d+)x(\d+)$/);
          if (dimMatch) {
            displayRes = `${dimMatch[2]}p`;
          }
        }
        badge.textContent = (displayRes || "N/A").toUpperCase();

        const qualityClass = getQualityClass(video.qualityLabel || video.resolution);
        if (qualityClass) {
          badge.classList.add(qualityClass);
        }

        const infoSpan = document.createElement("span");
        infoSpan.className = "file-type";
        const sizeStr = video.fileSize ? formatFileSize(video.fileSize) : "";
        infoSpan.textContent = sizeStr ? `MP4 • ${sizeStr}` : "MP4 (Video)";

        qualityDiv.appendChild(badge);
        qualityDiv.appendChild(infoSpan);

        const downloadBtn = document.createElement("a");
        downloadBtn.className = "btn-download-action";
        downloadBtn.href = `/api/download?url=${encodeURIComponent(video.url)}`;
        downloadBtn.target = "_blank";
        downloadBtn.innerHTML = `
          <span>Download</span>
          <i class="fa-solid fa-arrow-down-to-bracket"></i>
        `;

        itemDiv.appendChild(qualityDiv);
        itemDiv.appendChild(downloadBtn);

        downloadLinksList.appendChild(itemDiv);
      });
    } else {
      // No thumbnail to show for multi-video tweets without a group thumbnail
      videoThumbnail.src = "";
      videoThumbnail.classList.add("hidden");

      const noLinks = document.createElement("p");
      noLinks.style.color = "var(--text-secondary)";
      noLinks.style.fontSize = "0.9rem";
      noLinks.textContent =
        "No playable video streams extracted. Please check the URL.";
      downloadLinksList.appendChild(noLinks);
    }

    // Display container with animation
    resultContainer.classList.remove("hidden");
    // Scroll results into view smoothly
    setTimeout(() => {
      resultContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 150);
  }

  // UI state controllers
  function resetUI() {
    errorContainer.classList.add("hidden");
    resultContainer.classList.add("hidden");
  }

  function showLoader(show) {
    if (show) {
      loaderContainer.classList.remove("hidden");
    } else {
      loaderContainer.classList.add("hidden");
    }
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.remove("hidden");
    // Scroll error into view
    setTimeout(() => {
      errorContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }
});
