export const state = {
  tracks: [],
  albums: [],
  currentTrack: null,
  currentAlbum: null,
  currentAlbumId: null,
  audio: null,
  queue: null,
  filters: {
    artist: 'all',
    year: 'all',
    genre: 'all',
    search: ''
  }
};

export class Queue {
  constructor(items = []) {
    this.items = [...items];
    this.currentId = null;
    this.shuffleEnabled = false;
    this.repeatEnabled = false;
  }

  setItems(items = [], currentId = null) {
    this.items = [...items];
    this.currentId = currentId;
  }

  enqueue(item) {
    if (!item) return;
    const exists = this.items.find(entry => entry._id === item._id);
    if (!exists) {
      this.items.push(item);
    }
  }

  dequeue() {
    return this.items.shift();
  }

  setCurrent(track) {
    if (!track) return null;
    this.enqueue(track);
    this.currentId = track._id;
    return this.currentId;
  }

  currentIndexFor(id) {
    return this.items.findIndex(track => track._id === id);
  }

  next(currentId) {
    if (!this.items.length) return null;
    const idToUse = currentId ?? this.currentId;
    if (this.shuffleEnabled) {
      const pool = this.items.filter(track => track._id !== idToUse);
      const choice = pool[Math.floor(Math.random() * pool.length)] || this.items[0];
      this.currentId = choice?._id ?? null;
      return choice || null;
    }
    const index = this.currentIndexFor(idToUse);
    const nextIndex = index === -1 ? 0 : index + 1;
    if (nextIndex >= this.items.length) {
      if (!this.repeatEnabled) return null;
      this.currentId = this.items[0]._id;
      return this.items[0];
    }
    this.currentId = this.items[nextIndex]._id;
    return this.items[nextIndex];
  }

  previous(currentId) {
    if (!this.items.length) return null;
    const idToUse = currentId ?? this.currentId;
    if (this.shuffleEnabled) {
      const pool = this.items.filter(track => track._id !== idToUse);
      const choice = pool[Math.floor(Math.random() * pool.length)] || this.items[0];
      this.currentId = choice?._id ?? null;
      return choice || null;
    }
    const index = this.currentIndexFor(idToUse);
    const prevIndex = index <= 0 ? this.items.length - 1 : index - 1;
    if (prevIndex === this.items.length - 1 && index <= 0 && !this.repeatEnabled) return null;
    this.currentId = this.items[prevIndex]._id;
    return this.items[prevIndex];
  }

  toggleShuffle() {
    this.shuffleEnabled = !this.shuffleEnabled;
    return this.shuffleEnabled;
  }

  toggleRepeat() {
    this.repeatEnabled = !this.repeatEnabled;
    return this.repeatEnabled;
  }
}
