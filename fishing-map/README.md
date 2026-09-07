# Fishing Map

A simple browser-based map for tracking fishing spots and logging catches, built with [Leaflet](https://leafletjs.com/) and OpenStreetMap tiles.

## Features

- View known fishing spots (lake/river/pier) with species and notes.
- Click "Add Fishing Spot" to drop a pin for a new spot.
- Click "Log a Catch" to record species, length, weight, bait, date, and notes at a location.
- Catches show up on the map and in a sidebar list (deletable).
- Filter the map by species.
- Data persists in your browser via `localStorage` — no backend or account needed.

## Running locally

Because the app fetches `data/spots.json`, it needs to be served over HTTP (not opened as a `file://` URL):

```bash
cd fishing-map
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Editing the seed spots

Edit `data/spots.json` to change the built-in fishing spots (name, coordinates, type, species, notes). Spots you add through the UI are stored separately in your browser's local storage and merge with the seed list on load.

## Notes / next steps

- Coordinates in `data/spots.json` are placeholders near Kansas City — swap in real spots you fish.
- Data is per-browser (no sync across devices). A future step could add a small backend or a shared JSON file to sync spots/catches across devices.
