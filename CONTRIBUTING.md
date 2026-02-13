# Contributing to SIGINT RADAR

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test with `docker compose up --build`
4. Commit with a descriptive message
5. Open a pull request against `main`

## Adding a New Region Profile

1. Create `backend/regions/XX.py` (use existing profiles as template)
2. Define frequency bands with required fields:
   - `center_hz`, `bandwidth_hz`, `dwell_seconds`
   - `decoder`, `tx_power_dbm`, `description`
   - `category`, `priority`
3. Add import in `backend/regions/__init__.py`
4. Add country codes to `REGION_MAP`
5. Add region to `REGION_BANDS` and `REGION_LABELS`
6. See [docs/REGIONS.md](docs/REGIONS.md) for detailed guide

## Adding a Translation

1. Copy `frontend/src/i18n/en.json` to `frontend/src/i18n/XX.json`
2. Translate all string values (keep keys unchanged)
3. Add the language import in `frontend/src/i18n/index.jsx`
4. Add language option to `SetupWizard.jsx` language step

## Code Style

- Python: Follow PEP 8
- JavaScript: No semicolons, 2-space indent
- Use existing patterns and conventions

## Testing

Always verify changes work with:

```bash
docker compose up --build
```

Open http://localhost:3000 and verify the UI works correctly.
