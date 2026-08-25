# Sound asset provenance gate

The packaged tone catalogue is intentionally restored for local preview and
optional user-triggered ringtone/alarm application. Runtime code loads only the
selected file; it does not preload the catalogue.

## Confirmed original project output

- `public/sounds/dtmf/*.wav` — generated locally by
  `audio-assets-unverified/generate_pure_dtmf.js` from standard DTMF frequency
  pairs. Confirm authorship and retain the generator before release.

## Documentation required before Google Play release

The MP3 files currently have no source URL, author, license, commercial-use
terms, or written authorization recorded in this repository. Their inclusion
in a build is therefore a release blocker until the project owner records that
evidence here. File names or similarity to a Nokia device do not establish a
right to redistribute them.

For every approved file, record: relative path, SHA-256, creator, source URL,
license or written authorization, commercial redistribution terms, and review
date. Replace or remove any file whose rights cannot be established.
