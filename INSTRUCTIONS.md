# Import from URL — User Instructions

## Quick Start

1. Open **Import from URL** in Directus sidebar
2. Enter URL (CSV, Google Sheets, Excel)
3. Select target collection
4. Map columns to fields
5. Run import

## Supported Sources

| Format | Example URL |
|--------|-------------|
| CSV | `https://example.com/data.csv` |
| TSV | `https://example.com/data.tsv` |
| Excel | `https://example.com/data.xlsx` |
| Google Sheets | `https://docs.google.com/spreadsheets/d/.../edit` |

## Import Modes

| Mode | Description |
|------|-------------|
| **Insert** | Create new records only |
| **Upsert** | Update existing or create new (requires match field) |

## Gallery Import

Import images into `gallery-grid` or `files` fields:

1. CSV column with URLs separated by comma: `https://img1.jpg,https://img2.jpg`
2. Map this column to a gallery field
3. Configure gallery settings:
   - **Delimiter** — URL separator (default: `,`)
   - **Base URL** — Prefix for relative paths
   - **Mode** — `replace`, `append`, or `skip_existing`
   - **Skip errors** — Continue if some images fail

First image becomes the cover automatically.

## Features

- **Dry Run** — Test without saving
- **Saved Profiles** — Reuse configurations
- **Import History** — View past imports with error details
- **Real-time Progress** — Live progress bar during import
- **Parallel Upload** — 5 concurrent image downloads

## Tips

- Use **Dry Run** first to validate data
- For large imports, save a profile to reuse later
- Check **Import History** tab for detailed error reports
