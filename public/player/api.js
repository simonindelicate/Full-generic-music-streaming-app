import { state, Queue } from './state.js';
import { playerConfig } from './config.js';

function slugifyAlbumName(name = '') {
  return name
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function isExcluded(item) {
  return item?.excluded === true || item?.exclude === true || item?.excludeFromPlayer === true;
}

function buildAlbums(tracks) {
  const grouped = tracks.reduce((acc, track) => {
    if (!acc[track.albumName]) {
      acc[track.albumName] = {
        albumName: track.albumName,
        albumArtworkUrl: track.albumArtworkUrl,
        artworkUrl: track.artworkUrl,
        albumId: track.albumId || slugifyAlbumName(track.albumName),
        artistName: track.artistName,
        year: track.year,
        albumSortOrder: track.albumSortOrder,
        bgcolor: track.bgcolor,
      };
    }
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => (a.albumName || '').localeCompare(b.albumName || ''));
}


function generateBackroomsArtwork() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter></defs><rect width="300" height="300" fill="#c8b65b"/><rect width="300" height="300" filter="url(#n)" opacity="0.16"/><path d="M0 84h300M0 149h300M0 214h300M74 0v300M151 0v300M227 0v300" stroke="#8d7d35" stroke-width="8" opacity="0.45"/><text x="150" y="156" text-anchor="middle" font-family="monospace" font-size="39" font-weight="700" fill="#1a1708" filter="url(#g)">nø clip</text><text x="153" y="154" text-anchor="middle" font-family="monospace" font-size="39" font-weight="700" fill="#6b0f0f" opacity="0.42">n0 c1ip</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Build pseudo album objects from a settings config entry
function pseudoAlbumFromConfig(entry) {
  const derivedId = entry.albumId || entry.id || slugifyAlbumName(entry.albumName);
  return {
    albumName: entry.albumName,
    albumId: derivedId,
    albumArtworkUrl: entry.albumArtworkUrl || entry.artworkUrl || '',
    artworkUrl: entry.albumArtworkUrl || entry.artworkUrl || '',
    pseudoType: entry.pseudoType,
    allTracks: entry.pseudoType === 'all-tracks',
    enableShuffle: entry.enableShuffle !== false,
    limit: entry.limit ? Number(entry.limit) : undefined,
    trackIds: entry.trackIds || undefined,
    trackSortOrder: entry.trackSortOrder || 'manual',
    pseudoSortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : 999,
    placement: entry.placement || 'before',
    externalUrl: entry.externalUrl || entry.url || '',
  };
}

export async function loadLibrary() {
  const [tracksRes, albumsRes, settingsRes] = await Promise.all([
    fetch('/.netlify/functions/catalog?resource=tracks'),
    fetch('/.netlify/functions/catalog?resource=albums').catch(() => null),
    fetch('/.netlify/functions/siteSettings').catch(() => null),
  ]);

  const fetchedTracks = await tracksRes.json();
  const curatedAlbums = albumsRes ? await albumsRes.json() : [];
  const siteSettings = settingsRes ? await settingsRes.json().catch(() => ({})) : {};

  const excludedAlbumNames = new Set(curatedAlbums.filter(isExcluded).map(album => album.albumName));

  state.tracks = fetchedTracks
    .filter(track => track?.published !== false && !isExcluded(track))
    .filter(track => !excludedAlbumNames.has(track.albumName))
    .map(track => ({ ...track, albumId: track.albumId || slugifyAlbumName(track.albumName) }))
    .sort((a, b) => {
      if (a.albumName === b.albumName) {
        const aNum = Number(a.trackNumber) || 0;
        const bNum = Number(b.trackNumber) || 0;
        return aNum - bNum || (a.trackName || '').localeCompare(b.trackName || '');
      }
      return (a.albumName || '').localeCompare(b.albumName || '');
    });

  const albumList = curatedAlbums?.length ? curatedAlbums : buildAlbums(state.tracks);
  state.albums = albumList.filter(album => !isExcluded(album));
  state.albums = state.albums.map(album => ({
    ...album,
    albumId: album.albumId || slugifyAlbumName(album.albumName)
  }));

  // ── Load pseudo albums from site settings (admin-controlled) ──
  const settingsPseudoAlbums = Array.isArray(siteSettings.pseudoAlbums) ? siteSettings.pseudoAlbums : null;

  if (settingsPseudoAlbums) {
    // Admin has configured pseudo albums — use that config
    const enabled = settingsPseudoAlbums
      .filter(entry => entry.enabled !== false)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    enabled.forEach(entry => {
      const pseudo = pseudoAlbumFromConfig(entry);
      const exists = state.albums.some(a => a.albumId === pseudo.albumId);
      if (!exists) state.albums.push(pseudo);
    });
  } else {
    // Fall back to playerConfig (legacy behaviour)
    if (playerConfig?.allTracksAlbum) {
      const unifiedAlbumId = playerConfig.allTracksAlbum.albumId || slugifyAlbumName(playerConfig.allTracksAlbum.albumName);
      const alreadyExists = state.albums.some(album => album.albumId === unifiedAlbumId);
      if (!alreadyExists) {
        state.albums.unshift({
          albumName: playerConfig.allTracksAlbum.albumName || 'All Songs',
          albumId: unifiedAlbumId,
          albumArtworkUrl: playerConfig.allTracksAlbum.albumArtworkUrl || playerConfig.allTracksAlbum.artworkUrl,
          artworkUrl: playerConfig.allTracksAlbum.albumArtworkUrl || playerConfig.allTracksAlbum.artworkUrl,
          allTracks: true,
          pseudoType: 'all-tracks',
          enableShuffle: playerConfig.allTracksAlbum.enableShuffle !== false,
          pseudoSortOrder: 0,
        });
      }
    }

    const pseudoAlbumConfigs = [
      { key: 'whatsNewAlbum', pseudoType: 'whats-new', pseudoSortOrder: 1 },
      { key: 'favoritesAlbum', pseudoType: 'favorites', pseudoSortOrder: 2 }
    ];

    pseudoAlbumConfigs.forEach(entry => {
      const configEntry = playerConfig?.[entry.key];
      if (!configEntry) return;
      const derivedId = configEntry.albumId || slugifyAlbumName(configEntry.albumName);
      const exists = state.albums.some(album => (album.albumId || slugifyAlbumName(album.albumName)) === derivedId);
      if (exists) return;
      state.albums.push({
        albumName: configEntry.albumName,
        albumId: derivedId,
        albumArtworkUrl: configEntry.albumArtworkUrl || configEntry.artworkUrl,
        artworkUrl: configEntry.albumArtworkUrl || configEntry.artworkUrl,
        pseudoType: entry.pseudoType,
        limit: configEntry.limit ? Number(configEntry.limit) : undefined,
        enableShuffle: configEntry.enableShuffle !== false,
        pseudoSortOrder: entry.pseudoSortOrder,
      });
    });
  }


  if (siteSettings.backroomsEasterEggEnabled === true) {
    const backroomsAlbum = pseudoAlbumFromConfig({
      albumName: 'n̷o̴ ̶c̵l̸i̴p̸',
      albumId: 'backrooms-no-clip',
      pseudoType: 'backrooms-easter-egg',
      albumArtworkUrl: generateBackroomsArtwork(),
      sortOrder: -100,
      placement: 'before',
      externalUrl: '/extras/backrooms.html'
    });
    if (!state.albums.some(album => album.albumId === backroomsAlbum.albumId)) {
      state.albums.unshift(backroomsAlbum);
    }
  }

  state.queue = new Queue(state.tracks);
  return { tracks: state.tracks, albums: state.albums };
}
