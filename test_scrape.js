const axios = require('axios');
const cheerio = require('cheerio');

async function fetchFromTwitsaveFallback(tweetUrl) {
  try {
    const targetUrl = `https://twitsave.com/info?url=${encodeURIComponent(tweetUrl)}`;
    console.log(`Fetching: ${targetUrl}`);
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    console.log(`Status: ${response.status}`);
    const fs = require('fs');
    fs.writeFileSync('twitsave_response.html', response.data);
    console.log("HTML response dumped to twitsave_response.html");
    const $ = cheerio.load(response.data);

    const title = $('p.text-gray-600.dark\\:text-gray-300, div.p-4 p').first().text().trim() || 'X Video';
    const author = $('h3.font-bold, div.font-bold').first().text().trim() || 'X User';
    const username = $('p.text-gray-500, div.text-gray-500').first().text().trim() || '';
    let thumbnail = $('div.aspect-video img, div.relative img').first().attr('src') || '';
    
    console.log({ title, author, username, thumbnail });

    const videos = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && (href.includes('twitsave.com/download') || href.includes('/download?'))) {
        const text = $(el).text().trim();
        const resMatch = text.match(/\((\d+p|\d+x\d+)\)/) || text.match(/(\d+p|\d+x\d+)/);
        const resolution = resMatch ? resMatch[1] : `Format ${videos.length + 1}`;
        
        let absoluteUrl = href;
        if (href.startsWith('/')) {
          absoluteUrl = new URL(href, 'https://twitsave.com').toString();
        }

        if (!videos.some(v => v.url === absoluteUrl)) {
          videos.push({
            resolution,
            url: absoluteUrl
          });
        }
      }
    });

    console.log("Extracted videos:", videos);
    return videos;
  } catch (err) {
    console.error('Error in TwitSave fallback:', err.message);
    if (err.response) {
      console.log('Response status:', err.response.status);
    }
  }
}

const testUrl = 'https://x.com/SpaceX/status/1785480749007675762';
fetchFromTwitsaveFallback(testUrl);
