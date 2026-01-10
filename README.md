# Directus Extension: Import from URL

A Directus bundle extension for importing data from CSV, TSV, Excel (XLSX), or Google Sheets URLs into any collection.

![Directus 10.0+](https://img.shields.io/badge/Directus-10.0%2B-purple)
![License MIT](https://img.shields.io/badge/License-MIT-green)

## Features

- **Multiple Formats** — CSV, TSV, Excel (XLSX), Google Sheets
- **Import Wizard** — Step-by-step UI for configuring imports
- **Field Mapping** — Map source columns to Directus fields
- **Saved Profiles** — Save and reuse import configurations
- **Upsert Mode** — Create new or update existing records
- **Dry Run** — Test imports without writing data
- **Real-time Progress** — SSE-based progress tracking
- **Import History** — View past imports with detailed error reports
- **Auto-install** — Database tables created automatically
- **Gallery Import** — Import images into gallery-grid fields from URLs

## Installation

### NPM

```bash
npm install directus-extension-import-from-url
```

### Manual

1. Download the latest release
2. Extract to `extensions/directus-extension-import-from-url/`
3. Restart Directus

## Usage

### Accessing the Module

After installation, find **Import from URL** in the Directus sidebar.

### Import Wizard

#### Step 1: Source Configuration

- Enter URL (CSV, TSV, XLSX, or Google Sheets)
- Select target collection
- Choose delimiter (auto-detect, comma, semicolon, tab)
- Toggle header row option

#### Step 2: Preview & Mapping

- Preview first 10 rows of data
- Select sheet (for Excel files with multiple sheets)
- Map source columns to Directus fields
- Configure import options:
  - **Profile Name** — Save configuration for reuse
  - **Mode** — Insert only or Upsert (create/update)
  - **Match Field** — Field for finding existing records (upsert)
  - **Skip Empty** — Skip empty values during import
  - **Force Publish** — Set status to published

#### Step 3: Results

- View success/error counts
- Detailed error reports with row numbers
- Validation errors per field

### Saved Profiles

- Save import configurations for repeated use
- Run profiles with one click
- View last run status and statistics
- Edit or delete profiles

### Import History

- View all past import jobs
- Expandable error reports
- Debug info: original data vs. sent payload

## Supported Sources

| Source | URL Pattern |
|--------|-------------|
| CSV | `https://example.com/data.csv` |
| TSV | `https://example.com/data.tsv` |
| Excel | `https://example.com/data.xlsx` |
| Google Sheets | `https://docs.google.com/spreadsheets/d/...` |

Google Sheets URLs are automatically converted to CSV export format.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/import-from-url` | Health check |
| POST | `/import-from-url/preview` | Parse URL and return preview |
| POST | `/import-from-url/run` | Run import with config |
| POST | `/import-from-url/run?sse=true` | Run with SSE progress |
| POST | `/import-from-url/profiles/:id/run` | Run saved profile |
| DELETE | `/import-from-url/uninstall` | Remove extension tables |

### Example: Preview Data

```bash
curl -X POST https://your-directus/import-from-url/preview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://docs.google.com/spreadsheets/d/.../edit",
    "delimiter": "auto",
    "has_header": true
  }'
```

### Example: Run Import

```bash
curl -X POST https://your-directus/import-from-url/run \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/data.csv",
    "collection": "products",
    "mapping": {
      "Name": "name",
      "Price": "price",
      "SKU": "sku"
    },
    "mode": "upsert",
    "match_field": "sku",
    "match_source": "SKU"
  }'
```

## SSE Progress Streaming

Add `?sse=true` to receive real-time progress updates:

```
data: {"current": 5, "total": 100, "success": 4, "errors": 1, "percent": 5}
data: {"current": 6, "total": 100, "success": 5, "errors": 1, "percent": 6}
...
data: {"success": 95, "errors": 5, "details": [...], "done": true}
```

## Database Tables

The extension automatically creates:

- `directus_import_profiles` — Saved import configurations
- `directus_import_jobs` — Import history

## Security

- **SSRF Protection** — Blocks private IPs and internal hosts
- **URL Validation** — Only HTTP/HTTPS protocols allowed
- **Permissions** — Respects Directus user permissions

## Localization

UI supports English and Russian with automatic language detection.

## Gallery Import

Import images directly into `gallery-grid` or `files` interface fields (M2M relations to `directus_files`).

### How It Works

1. CSV/Google Sheets column contains image URLs separated by delimiter (default: comma)
2. Map this column to a gallery-grid field in the UI
3. Images are downloaded, uploaded to Directus, and linked via junction records

### Example CSV

```csv
title,price,images
"Product 1",100,"https://example.com/img1.jpg,https://example.com/img2.jpg"
"Product 2",200,"https://example.com/img3.jpg"
```

### Gallery Settings

| Setting | Description |
|---------|-------------|
| **Delimiter** | Character separating URLs (default: `,`) |
| **Base URL** | Prefix for relative paths (e.g., `https://example.com/images/`) |
| **Skip Errors** | Continue import if some images fail to download |
| **Mode** | `replace` (clear existing), `append` (add to end), `skip_existing` |

### Features

- First image automatically set as cover (`is_cover: true`)
- Parallel upload (5 concurrent) for faster import
- SSRF protection for URL validation
- Supports relative paths with base URL

## Bundle Contents

This extension includes:

- **Module: `import-from-url`** — Full-page import wizard UI
- **Endpoint: `/import-from-url`** — API for import operations

## Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

Miša ([@bulkmaker](https://github.com/bulkmaker))

## Links

- [Directus](https://directus.io)
- [Report Issues](https://github.com/bulkmaker/directus-extension-import-from-url/issues)
