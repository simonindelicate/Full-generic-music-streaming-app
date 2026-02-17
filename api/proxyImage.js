const http = require('http');
const https = require('https');
const { URL } = require('url');

exports.handler = async function (event) {
  const imageUrl = event.queryStringParameters?.url;

  if (!imageUrl) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }

  try {
    const { buffer, contentType } = await fetchImage(imageUrl);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    return { statusCode: 500, body: `Proxy error: ${error.message}` };
  }
};

function fetchImage(imageUrl, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error('Too many redirects'));
  }

  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
    } catch (error) {
      reject(new Error('Invalid url parameter'));
      return;
    }

    const client = parsedUrl.protocol === 'http:' ? http : https;

    const request = client.get(parsedUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsedUrl.protocol}//${parsedUrl.host}${res.headers.location}`;
        resolve(fetchImage(redirectUrl, redirectCount + 1));
        res.resume();
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Unable to fetch image: ${res.statusCode}`));
        res.resume();
        return;
      }

      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        resolve({
          buffer: Buffer.concat(data),
          contentType: res.headers['content-type'] || 'application/octet-stream'
        });
      });
    });

    request.on('error', reject);
  });
}

