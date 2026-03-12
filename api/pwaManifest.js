const { loadSiteSettings } = require('./lib/siteSettingsStore');

exports.handler = async (event) => {
  try {
    const s = await loadSiteSettings();

    const name = s.pwaName || s.brandName || s.siteTitle || 'Music Player';
    const shortName = s.pwaShortName || s.brandName || s.siteTitle || 'Music';
    const description = s.pwaDescription || s.metaDescription || 'Listen to tracks and albums.';
    const themeColor = s.pwaThemeColor || s.themeTopbarSurface || s.themeBackground || '#0f0c14';
    const backgroundColor = s.pwaBackgroundColor || s.themeBackground || '#0f0c14';

    // Build an absolute origin so the manifest `id` is a full URL.
    // This is required by Samsung Internet for stable PWA identity and avoids
    // Play Protect treating the installed package as an unknown sideloaded app.
    const host = (event.headers && (event.headers['x-forwarded-host'] || event.headers.host)) || '';
    const proto = (event.headers && event.headers['x-forwarded-proto']) || 'https';
    const origin = host ? `${proto}://${host}` : '';
    const absoluteId = origin ? `${origin}/` : '/';

    // Prefer admin-uploaded icons; fall back to the shipped defaults.
    const icon192 = s.pwaIcon192 || '/icon_192.png';
    const icon512 = s.pwaIcon512 || '/icon_512.png';

    const icons = [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ];

    // Admin-provided screenshots (helps Chrome show the richer install UI
    // without the "unverified publisher" warning style banner).
    const screenshots = [];
    if (s.pwaScreenshot1) {
      screenshots.push({
        src: s.pwaScreenshot1,
        sizes: s.pwaScreenshot1Sizes || '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: name
      });
    }
    if (s.pwaScreenshot2) {
      screenshots.push({
        src: s.pwaScreenshot2,
        sizes: s.pwaScreenshot2Sizes || '1280x800',
        type: 'image/png',
        form_factor: 'wide',
        label: name
      });
    }

    const manifest = {
      // Absolute URL id is the single most important signal for Samsung Internet
      // and Chrome to recognise this as the same installed PWA across sessions.
      id: absoluteId,
      name,
      short_name: shortName,
      description,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      display_override: ['window-controls-overlay', 'standalone'],
      orientation: 'any',
      background_color: backgroundColor,
      theme_color: themeColor,
      categories: ['music', 'entertainment'],
      // `prefer_related_applications: false` tells Play Protect and Samsung
      // Internet explicitly that this is a first-class PWA, not a wrapper
      // hiding a native APK — the primary fix for the "unsafe app" warning.
      prefer_related_applications: false,
      icons,
      ...(screenshots.length ? { screenshots } : {})
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
      },
      body: JSON.stringify(manifest)
    };
  } catch (err) {
    console.error('pwaManifest error', err);
    return { statusCode: 500, body: 'Internal error generating manifest' };
  }
};
