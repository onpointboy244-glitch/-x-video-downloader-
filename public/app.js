document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const downloadForm = document.getElementById('download-form');
  const tweetUrlInput = document.getElementById('tweet-url');
  const btnFetch = document.getElementById('btn-fetch');
  const loaderContainer = document.getElementById('loader-container');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');
  const resultContainer = document.getElementById('result-container');
  
  // Result elements
  const authorName = document.getElementById('tweet-author-name');
  const authorHandle = document.getElementById('tweet-author-handle');
  const tweetDescription = document.getElementById('tweet-description');
  const videoThumbnail = document.getElementById('video-thumbnail');
  const downloadLinksList = document.getElementById('download-links-list');

  // FAQ Accordion logic
  const faqQuestions = document.querySelectorAll('.faq-question');
  faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
      const currentItem = question.parentElement;
      const isActive = currentItem.classList.contains('active');
      
      // Close all other items
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
      });
      
      // Toggle current item
      if (!isActive) {
        currentItem.classList.add('active');
      }
    });
  });

  // Smooth scroll active state highlighting
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop;

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (scrollPos >= sectionTop - 120) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href').substring(1) === current) {
        link.classList.add('active');
      }
    });
  });

  // Handle Form Submission
  downloadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const tweetUrl = tweetUrlInput.value.trim();
    if (!tweetUrl) return;

    // Reset UI states
    resetUI();
    showLoader(true);
    btnFetch.disabled = true;

    try {
      console.log(`Sending API request to fetch info for: ${tweetUrl}`);
      const response = await fetch(`/api/fetch?url=${encodeURIComponent(tweetUrl)}`);
      const data = await response.json();

      if (response.ok && data.success) {
        displayResults(data);
      } else {
        showError(data.error || 'Failed to extract video links. Please verify the URL and try again.');
      }
    } catch (err) {
      console.error('Fetch request error:', err);
      showError('Unable to connect to the downloader service. Please check your internet connection and try again.');
    } finally {
      showLoader(false);
      btnFetch.disabled = false;
    }
  });

  // Display results in the DOM
  function displayResults(data) {
    // Set text contents
    authorName.textContent = data.author || 'X User';
    authorHandle.textContent = data.username ? `@${data.username}` : '@x_user';

    // Set tweet description and statistics
    const tweetDescriptionElement = document.getElementById('tweet-description');
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
    
    // Set thumbnail
    if (data.thumbnail) {
      videoThumbnail.src = data.thumbnail;
      videoThumbnail.classList.remove('hidden');
    } else {
      videoThumbnail.src = '';
      videoThumbnail.classList.add('hidden');
    }

    // Build download buttons
    downloadLinksList.innerHTML = '';
    
    if (data.videos && data.videos.length > 0) {
      // Sort resolutions descending (e.g. 720p, 480p, 270p)
      const sortedVideos = [...data.videos].sort((a, b) => {
        const getResValue = (res) => {
          const match = res.match(/(\d+)/);
          return match ? parseInt(match[0], 10) : 0;
        };
        return getResValue(b.resolution) - getResValue(a.resolution);
      });

      sortedVideos.forEach(video => {
        // Construct the item element
        const itemDiv = document.createElement('div');
        itemDiv.className = 'download-item';
        
        // Quality info section
        const qualityDiv = document.createElement('div');
        qualityDiv.className = 'download-quality';
        
        const badge = document.createElement('span');
        badge.className = 'quality-badge';
        badge.textContent = video.resolution.toUpperCase();
        
        const typeSpan = document.createElement('span');
        typeSpan.className = 'file-type';
        typeSpan.textContent = 'Format: MP4 (Video)';
        
        qualityDiv.appendChild(badge);
        qualityDiv.appendChild(typeSpan);
        
        // Action button (uses server proxy to force browser download)
        const downloadBtn = document.createElement('a');
        downloadBtn.className = 'btn-download-action';
        // Use our proxy endpoint to download with custom filename
        downloadBtn.href = `/api/download?url=${encodeURIComponent(video.url)}`;
        downloadBtn.target = '_blank';
        downloadBtn.innerHTML = `
          <span>Download</span>
          <i class="fa-solid fa-arrow-down-to-bracket"></i>
        `;
        
        itemDiv.appendChild(qualityDiv);
        itemDiv.appendChild(downloadBtn);
        
        downloadLinksList.appendChild(itemDiv);
      });
    } else {
      const noLinks = document.createElement('p');
      noLinks.style.color = 'var(--text-secondary)';
      noLinks.style.fontSize = '0.9rem';
      noLinks.textContent = 'No playable video streams extracted. Please check the URL.';
      downloadLinksList.appendChild(noLinks);
    }

    // Display container with animation
    resultContainer.classList.remove('hidden');
    // Scroll results into view smoothly
    setTimeout(() => {
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
  }

  // UI state controllers
  function resetUI() {
    errorContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
  }

  function showLoader(show) {
    if (show) {
      loaderContainer.classList.remove('hidden');
    } else {
      loaderContainer.classList.add('hidden');
    }
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorContainer.classList.remove('hidden');
    // Scroll error into view
    setTimeout(() => {
      errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }
});
