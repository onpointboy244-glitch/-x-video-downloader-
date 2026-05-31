const axios = require('axios');

async function testCobalt() {
  try {
    const url = 'https://x.com/SpaceX/status/1785480749007675762';
    console.log(`Testing Cobalt for: ${url}`);
    
    // Note: older versions used '/' or '/api/json', let's try the modern standard endpoint '/' first or check
    const response = await axios.post('https://api.cobalt.tools/', {
      url: url,
      vQuality: '720'
    }, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    console.log('Status:', response.status);
    console.log('Response Keys:', Object.keys(response.data));
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('Error calling Cobalt:', err.message);
    if (err.response) {
      console.log('Error Status:', err.response.status);
      console.log('Error Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testCobalt();
