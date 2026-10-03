# Catalogue 1.0 specification

## Contents

- What is a catalogue?
- Sample file
- Where a catalogue lives
- Required elements
- Optional elements of the catalogue
- Optional elements of a release
- Optional elements of a track
- Extensions
- Rules for readers
- Version history

## What is a catalogue?

A catalogue is a single JSON file that lists a musician's or a label's records, and for each record its songs, with the address of every song's audio. It plays the part for recorded music that an RSS feed plays for a podcast. A catalogue can be published by anyone who can put a file on a web server, and any program that reads catalogues can then present that music: as a player, a radio station, a shop window, a map, or anything else.

A catalogue needs no particular software to make or to serve it. It may be written by hand, produced by a program, or generated on request by a server. Readers must work equally well with all of them.

This document says what a catalogue must contain, what it may contain, and where readers find it. Words such as MUST, SHOULD and MAY are used in the sense of RFC 2119.

## Sample file

```json
{
  "feedVersion": "1",
  "instance": {
    "name": "The Lonely Crowd",
    "description": "Four-piece from Hastings, making records since 2009.",
    "url": "https://lonelycrowd.example"
  },
  "releases": [
    {
      "id": "night-bus",
      "title": "Night Bus",
      "artist": "The Lonely Crowd",
      "artworkUrl": "https://lonelycrowd.example/music/night-bus/cover.jpg",
      "year": 2019,
      "tracks": [
        {
          "id": "k3x9q2ma",
          "title": "Night Bus",
          "trackNumber": 1,
          "durationSeconds": 212,
          "audioUrl": "https://lonelycrowd.example/music/night-bus/01-night-bus.mp3"
        },
        {
          "id": "p8d1v0wz",
          "title": "Ferry Across",
          "trackNumber": 2,
          "durationSeconds": 187,
          "audioUrl": "https://lonelycrowd.example/music/night-bus/02-ferry-across.mp3"
        }
      ]
    }
  ]
}
```

## Where a catalogue lives

Every catalogue has a base address, which is the address of the site or folder it belongs to, such as `https://lonelycrowd.example` or `https://files.example/lonely-crowd`. The catalogue itself is always found at the base address followed by `/catalogue`, so the two examples above are read from `https://lonelycrowd.example/catalogue` and `https://files.example/lonely-crowd/catalogue`. This is what lets a listener type a site's address into a reader and have it find the music. A reader given an address that already ends in `/catalogue` treats what comes before it as the base.

The file at that address MUST be served:

- with the HTTP status 200;
- encoded as UTF-8;
- with the header `Access-Control-Allow-Origin: *`, so that readers running in a web browser on other sites are allowed to read it.

It SHOULD be served with the content type `application/json`, but readers MUST NOT depend on that, because many simple hosts cannot set a content type for a file without an extension. A publisher who also keeps a copy at `/catalogue.json` may do so; readers do not look for it.

A catalogue that its owner does not wish to be read MAY answer with 403 instead. Readers treat any status other than 200 as meaning that no catalogue is available.

A web page MAY point to its catalogue with a link element in its head, for programs that come across the page rather than being given the address:

```html
<link rel="alternate" type="application/json" title="The Lonely Crowd catalogue" href="https://lonelycrowd.example/catalogue">
```

### Addresses

Every address in a catalogue (of audio, of artwork, of anything else) MUST be absolute, beginning with `https://` or `http://`. `https://` is strongly preferred, because browsers will not play `http://` audio on an `https://` page.

The audio and artwork MUST be publicly readable without signing in. They SHOULD be served with `Access-Control-Allow-Origin: *`, which readers need in order to analyse the sound (to draw a visualiser, say) or to read the colours of a cover, and with support for HTTP range requests, which players need in order to let listeners skip about within a song.

## Required elements

The catalogue is a JSON object with three required elements.

| Element | Description | Example |
|---|---|---|
| `feedVersion` | The version of this specification the catalogue follows, as a string. | `"1"` |
| `instance` | An object describing who publishes the catalogue. Its one required element is `name`. | `{ "name": "The Lonely Crowd" }` |
| `releases` | An array of releases. It MAY be empty. | `[ … ]` |

`instance.name` is the name of the musician, band or label, as listeners should see it.

A **release** is a record: an album, an EP, a single, a compilation or a live recording. It is an object with four required elements.

| Element | Description | Example |
|---|---|---|
| `id` | A string identifying the release, unique within the catalogue. | `"night-bus"` |
| `title` | The title of the release. | `"Night Bus"` |
| `artist` | Who the release is credited to, as a single string. A release by several artists is credited to all of them in one string. | `"The Lonely Crowd and Cat Vincent"` |
| `tracks` | An array of tracks. | `[ … ]` |

A **track** is a song or other recording on a release. It is an object with three required elements.

| Element | Description | Example |
|---|---|---|
| `id` | A string identifying the track, unique within the whole catalogue, not merely within its release. | `"k3x9q2ma"` |
| `title` | The title of the track. | `"Ferry Across"` |
| `audioUrl` | The absolute address of the audio. Required unless the track is `gated` (see below). | `"https://…/02-ferry-across.mp3"` |

The audio SHOULD be MP3, which every browser and device can play. AAC in an M4A file is acceptable. Other formats are permitted but some readers will not be able to play them.

### Identifiers are permanent

Readers build lasting things from identifiers: links to a song, mixtapes, playlists, listening histories. So an `id` MUST NOT change once published, even when the title of the release or track changes, and an `id` that has been used MUST NOT later be given to something else. Identifiers may contain any characters, but letters, digits and hyphens are kindest to readers who put them in addresses.

## Optional elements of the catalogue

| Element | Description | Example |
|---|---|---|
| `instance.description` | A sentence or two about the musician or label, in plain text. | `"Four-piece from Hastings."` |
| `instance.url` | The address of the publisher's own website. | `"https://lonelycrowd.example"` |
| `instance.feedUrl` | The address of this catalogue. | `"https://lonelycrowd.example/catalogue"` |
| `instance.logoUrl` | The address of a logo or picture representing the publisher. | `"https://…/logo.png"` |
| `generatedAt` | When the catalogue was last written, in ISO 8601 form. | `"2026-10-03T09:11:48Z"` |
| `releaseCount` | The number of releases, for convenience. Readers count the array themselves rather than trusting it. | `12` |

## Optional elements of a release

| Element | Description | Example |
|---|---|---|
| `artworkUrl` | The address of the cover, square, ideally at least 1000 pixels across, as JPEG or PNG. | `"https://…/cover.jpg"` |
| `year` | The year of release, as a number. | `2019` |
| `genre` | A genre, in the publisher's own words. | `"Indie"` |
| `buyUrl` | The address of a page where the release can be bought: a download, a physical copy, a collector's edition. Readers MAY show it as a way to buy the release, and are free to ignore it. | `"https://shop.example/night-bus"` |
| `trackCount` | The number of tracks, for convenience. Readers count the array themselves. | `11` |

## Optional elements of a track

| Element | Description | Example |
|---|---|---|
| `trackNumber` | The track's position on the release, counting from 1. Readers order tracks by this, and by their order in the array where it is missing. | `2` |
| `durationSeconds` | The length of the track, in seconds. | `187` |
| `artist` | Who the track is credited to, where that differs from the release. | `"Cat Vincent"` |
| `artworkUrl` | The address of artwork for this track, where it differs from the release's cover. | `"https://…/ferry.jpg"` |
| `year` | The year of the track, where it differs from the release. | `2018` |
| `genre` | A genre for the track, where it differs from the release. | `"Folk"` |
| `description` | Notes about the track, in plain text. Line breaks are allowed. | `"Recorded live to tape."` |
| `medium` | What kind of recording it is, in the publisher's own words. | `"live"` |
| `gated` | `true` when the track exists but its audio is not freely available, for instance because it is sold or kept for subscribers. A gated track has no `audioUrl`. Readers list it as unavailable, or leave it out. | `true` |

## Extensions

Publishers MAY add elements of their own anywhere in a catalogue, and readers MUST ignore any element they do not understand. This is how the format grows without breaking anything already written: a new element is useful to the readers that know it and invisible to the rest. An element that proves widely useful can be adopted into a later version of this document.

One extension is in use already, for moving a catalogue from one installation of a program to another:

| Element | Description |
|---|---|
| `importEnabled` | At the top level. `true` when the publisher is willing for another installation to copy the catalogue's files, including those of gated tracks. |
| `importAudioUrl` | On a track. The address from which an importing installation may copy the audio, present only when `importEnabled` is `true`. It may be given for gated tracks, whose `audioUrl` is absent. |

Ordinary readers ignore both.

## Rules for readers

A reader:

- MUST ignore elements it does not understand, wherever they appear;
- MUST NOT fail because an optional element is missing, and SHOULD carry on past a single release or track that is malformed;
- MUST NOT depend on the order of releases in the array, which carries no meaning;
- SHOULD treat two releases with the same title and year as one release, since some publishers list a record once for each of its credited artists;
- SHOULD NOT fetch a catalogue more often than once every few minutes, and SHOULD respect any caching headers it is served with;
- MAY, for the sake of robustness, resolve a relative address it meets against the address of the catalogue, though publishers MUST NOT rely on that.

## Version history

1.0, October 2026: first written down, describing the format already published by the catalogue function of the self-hosted music streaming app and read by its catalogue toys.
