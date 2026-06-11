document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const downloadForm = document.getElementById("download-form");
  const tweetUrlInput = document.getElementById("tweet-url");
  const btnFetch = document.getElementById("btn-fetch");
  const loaderContainer = document.getElementById("loader-container");
  const errorContainer = document.getElementById("error-container");
  const errorMessage = document.getElementById("error-message");
  const retryBtn = document.getElementById("btn-retry");
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
    // Link question to its answer panel via IDs added in HTML
    const answerEl = question.closest(".faq-item")?.querySelector(".faq-answer");
    const answerId = answerEl?.id;
    question.setAttribute("role", "button");
    question.setAttribute("aria-expanded", "false");
    if (answerId) question.setAttribute("aria-controls", answerId);

    function toggleFaq() {
      const currentItem = question.parentElement;
      const isActive = currentItem.classList.contains("active");

      // Close all other items
      document.querySelectorAll(".faq-item").forEach((item) => {
        item.classList.remove("active");
        const q = item.querySelector(".faq-question");
        if (q) q.setAttribute("aria-expanded", "false");
      });

      // Toggle current item
      if (!isActive) {
        currentItem.classList.add("active");
        question.setAttribute("aria-expanded", "true");
      } else {
        question.setAttribute("aria-expanded", "false");
      }
    }

    question.addEventListener("click", toggleFaq);
    question.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleFaq();
      }
    });
  });

  // Mobile nav toggle
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const mobileNav = document.getElementById("mobile-nav");

  if (hamburgerBtn && mobileNav) {
    hamburgerBtn.addEventListener("click", () => {
      hamburgerBtn.classList.toggle("open");
      mobileNav.classList.toggle("open");
    });

    // Close mobile nav when a link is clicked
    mobileNav.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", () => {
        hamburgerBtn.classList.remove("open");
        mobileNav.classList.remove("open");
      });
    });

    // Close mobile nav on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mobileNav.classList.contains("open")) {
        hamburgerBtn.classList.remove("open");
        mobileNav.classList.remove("open");
        hamburgerBtn.focus();
      }
    });
  }

  // Active nav highlighting via IntersectionObserver
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll("section");

  if (typeof IntersectionObserver !== "undefined") {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((link) => {
              link.classList.remove("active");
              if (link.getAttribute("href").substring(1) === entry.target.getAttribute("id")) {
                link.classList.add("active");
              }
            });
          }
        });
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
  } else {
    // Fallback for older browsers: debounced scroll listener
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollPos = window.scrollY || document.documentElement.scrollTop;
          let current = "";
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
          ticking = false;
        });
        ticking = true;
      }
    });
  }

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

  // Ad interstitial — premium, non-blocking with immediate skip
  function showAdOverlay() {
    const interstitial = document.getElementById("ad-interstitial");
    const countdownEl = document.getElementById("ad-interstitial-countdown");
    const dismissBtn = document.getElementById("ad-dismiss-btn");
    if (!interstitial) return;

    interstitial.classList.remove("hidden");

    // Always immediately dismissible
    dismissBtn.disabled = false;

    let secondsLeft = 3;
    countdownEl.textContent = "Auto-closes in " + secondsLeft + "…";

    const countdownInterval = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        countdownEl.textContent = "Auto-closes in " + secondsLeft + "…";
      } else {
        countdownEl.textContent = "You can continue now";
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Focus the dismiss button for keyboard users
    setTimeout(() => dismissBtn.focus(), 50);

    let dismissed = false;
    function dismissOverlay() {
      if (dismissed) return;
      dismissed = true;
      interstitial.classList.add("hidden");
      clearInterval(countdownInterval);
      dismissBtn.removeEventListener("click", dismissOverlay);
      document.removeEventListener("keydown", onInterstitialKeydown);
      // Return focus to the fetch button
      btnFetch.focus();
    }

    function onInterstitialKeydown(e) {
      if (e.key === "Escape" && !dismissed) {
        e.preventDefault();
        dismissOverlay();
      }
    }

    dismissBtn.addEventListener("click", dismissOverlay);
    document.addEventListener("keydown", onInterstitialKeydown);

    // Auto-dismiss after 3s
    setTimeout(() => {
      dismissOverlay();
    }, 3000);
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
      const response = await fetch(
        `/api/fetch?url=${encodeURIComponent(tweetUrl)}`,
      );
      const data = await response.json();

      if (response.ok && data.success) {
        displayResults(data);
      } else {
        showError(
          data.error ||
            "Couldn't find any video at that URL. Make sure the tweet is public and contains a video or GIF.",
        );
      }
    } catch (err) {
      showError(
        "Couldn't reach the downloader service. Check your internet connection and try again.",
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
    // Reference to media preview
    const mediaPreview = document.getElementById("media-preview-container");

    // Helper to show thumbnail if present
    function setThumbnail(src) {
      if (src) {
        videoThumbnail.src = src;
        mediaPreview.classList.remove("hidden");
        videoThumbnail.onerror = () => { mediaPreview.classList.add("hidden"); };
      } else {
        videoThumbnail.removeAttribute("src");
        mediaPreview.classList.add("hidden");
      }
    }

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
        thumbImg.loading = "lazy";
        const thumbSrc = group.thumbnail || data.thumbnail;
        if (thumbSrc) {
          thumbImg.src = thumbSrc;
          thumbImg.onerror = () => { thumbImg.style.display = "none"; };
        } else {
          thumbImg.style.display = "none";
        }

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

        // Show thumbnail for first media group
        if (group === data.mediaGroups[0] && data.thumbnail) {
          setThumbnail(data.thumbnail);
        }

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
      setThumbnail(data.thumbnail);

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
      // No thumbnail available
      setThumbnail(null);

      const noLinks = document.createElement("p");
      noLinks.className = "fallback-message";
      noLinks.textContent =
        "This tweet doesn't seem to contain any playable video or GIF content.";
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
    setTimeout(() => {
      errorContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (retryBtn) retryBtn.focus({ preventScroll: true });
    }, 100);
  }

  // Retry button: re-submit the form with the current URL
  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      // Trigger form submit to re-run the full flow
      downloadForm.dispatchEvent(new Event("submit"));
    });
  }

  // Auto-update copyright year
  const copyrightEl = document.querySelector(".footer-copy");
  if (copyrightEl) {
    const year = new Date().getFullYear();
    copyrightEl.textContent = copyrightEl.textContent.replace(/\d{4}/, year);
  }
});
