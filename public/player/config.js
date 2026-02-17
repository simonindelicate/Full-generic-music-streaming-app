export const playerConfig = {
  siteBranding: {
    siteTitle: 'Tracks',
    brandName: 'Simon Indelicate',
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
    title: 'Albums by Simon Indelicate',
    subtitle: 'Please enjoy this self-hosted, spiralling collection of music unsullied by middle men and landlords. Your <a href="support.html">support is welcomed</a>'
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
