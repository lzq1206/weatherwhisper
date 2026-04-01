# WeatherWhisper

WeatherWhisper is a China climate visualization site designed to feel closer to a WeatherSpark-style annual climate page.

## What it does
- Presents a selected station as a full climate page with:
  - annual summary
  - monthly temperature curves
  - precipitation / humidity / wind trends
  - month spotlight table
  - best time to visit
- Lets you switch between stations from China’s climate dataset
- Keeps a map view for browsing and station selection
- Uses a dark, glassy, information-dense layout inspired by WeatherSpark

## Data
Station summaries and monthly climate files live in `public/data/`.

## Local development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Source data
The repository includes processed climate station files under `public/data/` and `data/processed/`.

If you want to refresh or extend the data pipeline, check the scripts in `scripts/`:
- `scripts/crawler.py`
- `scripts/download_climate_data.py`
- `scripts/processor.py`

## Notes
- The page is static and deploys cleanly with Vite.
- The new layout emphasizes annual climate interpretation first, then monthly detail and map browsing.
