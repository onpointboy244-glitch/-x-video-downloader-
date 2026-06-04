const axios = require('axios');
const fs = require('fs');

const tweetId = '2062071814172422253';

async function test() {
  // Dump full FxTwitter response
  try {
    const r = await axios.get(`https://api.fxtwitter.com/i/status/${tweetId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    fs.writeFileSync('debug_fxtwitter.json', JSON.stringify(r.data, null, 2));
    console.log('FxTwitter response saved to debug_fxtwitter.json');
    console.log('Top-level keys:', Object.keys(r.data));
    if (r.data.tweet) {
      console.log('tweet keys:', Object.keys(r.data.tweet));
    }
  } catch (e) {
    console.log('FxTwitter error:', e.response?.status, e.message);
    if (e.response) {
      fs.writeFileSync('debug_fxtwitter_error.json', JSON.stringify(e.response.data, null, 2));
      console.log('Error response saved');
    }
  }

  // Dump full VxTwitter response
  try {
    const r = await axios.get(`https://api.vxtwitter.com/i/status/${tweetId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000,
    });
    fs.writeFileSync('debug_vxtwitter.json', JSON.stringify(r.data, null, 2));
    console.log('VxTwitter response saved to debug_vxtwitter.json');
    console.log('Top-level keys:', Object.keys(r.data));
  } catch (e) {
    console.log('VxTwitter error:', e.response?.status, e.message);
  }
}

test();
