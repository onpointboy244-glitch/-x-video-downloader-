const axios = require('axios');
const { getGuestToken } = require('twitter-downloader/lib/utils/getGuestToken');
const { getTwitterAuthorization } = require('twitter-downloader/lib/utils/getAuthorization');
const { variables, features } = require('twitter-downloader/lib/contants/params');
const { _twitterapi, _twitterPostID, _tweetresultbyrestid } = require('twitter-downloader/lib/contants/api');

async function testApi() {
  const url = 'https://x.com/SpaceX/status/1785480749007675762';
  const id = url.match(/\/([\d]+)/);
  if (!id) {
    console.log("No ID found!");
    return;
  }
  
  try {
    const guest_token = await getGuestToken();
    const auth = await getTwitterAuthorization();
    console.log("Guest Token:", guest_token);
    console.log("Auth:", auth);

    const api_url = _twitterapi(_twitterPostID, _tweetresultbyrestid);
    console.log("Calling API:", api_url);

    const response = await axios(api_url, {
      method: "GET",
      params: {
        variables: JSON.stringify(variables(id[1])),
        features: JSON.stringify(features),
      },
      headers: {
        Authorization: auth,
        "x-guest-token": guest_token,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });

    console.log("Status:", response.status);
    console.log("Data keys:", Object.keys(response.data));
    console.log("TweetResult:", JSON.stringify(response.data.data.tweetResult, null, 2).substring(0, 1000));
  } catch (err) {
    console.error("API error:", err.message);
    if (err.response) {
      console.log("Err data:", JSON.stringify(err.response.data, null, 2));
    }
  }
}

testApi();
