export const playerConfig = {
  siteBranding: {
    siteTitle: 'Tracks',
    brandName: 'Independent Artist',
    logoUrl: ''
  },
  tipJar: {
    enabled: true,
    url: '/support.html',
    iconClass: 'fa-circle-dollar-to-slot'
  },
  layout: {
    tracksFirstOnDesktop: false
  },
  welcomeAlbums: {
    title: 'Albums',
    subtitle: 'Explore this self-hosted collection. <a href="support.html">Support is welcome</a>.'
  },
  initialBackgroundColor: '#bdadb6',
  initialOverlayTone: 'rgba(189, 173, 182, 0.92);',
  dynamicTheming: true,
  allTracksAlbum: {
    albumName: 'Shuffle Everything',
    albumId: 'all-songs-shuffle',
    albumArtworkUrl: 'https://www.indelicates.xyz/phariseeland/mp3/shuff.png',
    allTracks: true,
    enableShuffle: true
  },
  whatsNewAlbum: {
    albumName: "What's New",
    albumId: 'whats-new',
    albumArtworkUrl: 'https://indelicates.xyz/extrasmp3/new.jpg',
    limit: 30
  },
  favoritesAlbum: {
    albumName: 'An Introduction for Casuals',
    albumId: 'favorites',
    albumArtworkUrl: 'https://indelicates.xyz/extrasmp3/casuals.jpg'
  }
};
