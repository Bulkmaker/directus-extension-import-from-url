import { Readable } from 'stream';
import axios from 'axios';
import { validateUrl } from './security';

export interface GalleryFieldConfig {
    fieldName: string;
    junctionCollection: string;
    junctionField: string;
    fileField: string;
    folder?: string;
}

export interface GalleryOptions {
    delimiter: string;
    folder?: string;
    skip_errors?: boolean;
    mode?: 'replace' | 'append' | 'skip_existing';  // replace=clear first, append=add to end, skip_existing=skip duplicates
    base_url?: string;  // Base URL for relative paths (e.g., https://example.com)
}

export interface ImportServices {
    filesService: any;
    ItemsService: any;
    schema: any;
    accountability: any;
}

export interface ImportOptions {
    collection: string;
    mapping: Record<string, string>;
    mode: 'insert' | 'upsert';
    match_field?: string;
    match_source?: string;
    selected_fields?: string[];
    skip_empty_values?: boolean;
    force_publish?: boolean;
    defaults?: Record<string, any>;
    dry_run?: boolean;
    gallery_fields?: Record<string, GalleryFieldConfig>;
    gallery_options?: GalleryOptions;
}

export interface ImportReport {
    success: number;
    errors: number;
    details: any[];
    dry_run?: boolean;
    warnings?: any[];
}

function normalizeValue(value: any): any {
    if (typeof value !== 'string') return value;

    // Handle DD.MM.YYYY [HH:mm:ss] (Russian/European format)
    const ruDateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
    const match = value.match(ruDateRegex);
    if (match) {
        const [_, day, month, year, hour, minute, second] = match;
        let iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        if (hour) {
            iso += `T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second || '00').padStart(2, '0')}`;
        }
        return iso;
    }

    // Handle DD/MM/YYYY [HH:mm:ss] (Common format)
    const slashDateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
    const matchSlash = value.match(slashDateRegex);
    if (matchSlash) {
        const [_, day, month, year, hour, minute, second] = matchSlash;
        let iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        if (hour) {
            iso += `T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${(second || '00').padStart(2, '0')}`;
        }
        return iso;
    }

    return value;
}

async function uploadImageFromUrl(
    url: string,
    filesService: any,
    folder?: string
): Promise<string | null> {
    try {
        validateUrl(url);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 20 * 1024 * 1024,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const contentType = response.headers['content-type'] || '';
        if (!contentType.startsWith('image/')) {
            console.warn('[Import Gallery] Not an image:', url, contentType);
            return null;
        }

        // Extract filename from URL
        const urlPath = new URL(url).pathname;
        let filename = urlPath.split('/').pop() || `image_${Date.now()}.jpg`;
        filename = filename.split('?')[0];
        if (!filename.includes('.')) {
            filename += '.' + (contentType.split('/')[1] || 'jpg');
        }

        // Generate title from filename (remove extension, replace underscores/dashes with spaces)
        const title = filename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');

        const fileId = await filesService.uploadOne(
            Readable.from(Buffer.from(response.data)),
            {
                filename_download: filename,
                title: title,
                type: contentType,
                folder: folder || undefined,
                storage: process.env.STORAGE_LOCATIONS?.split(',')[0] || 'local',
            }
        );

        return fileId;
    } catch (error: any) {
        console.error('[Import Gallery] Image upload failed:', url, error.message);
        return null;
    }
}

async function processGalleryField(
    urlsString: string,
    fieldConfig: GalleryFieldConfig,
    parentItemId: string | number,
    services: ImportServices,
    options: GalleryOptions
): Promise<{ success: number; errors: string[]; skipped: number }> {
    const result = { success: 0, errors: [] as string[], skipped: 0 };
    const mode = options.mode || 'replace';
    const baseUrl = options.base_url?.replace(/\/$/, '');  // Remove trailing slash

    // Parse URLs: support full URLs and relative paths (with base_url)
    const urls = urlsString
        .split(options.delimiter || ',')
        .map(u => u.trim())
        .filter(u => u.length > 0)
        .map(u => {
            // Already a full URL
            if (u.startsWith('http://') || u.startsWith('https://')) {
                return u;
            }
            // Relative path - prepend base_url if available
            if (baseUrl) {
                const path = u.startsWith('/') ? u : '/' + u;
                return baseUrl + path;
            }
            // No base_url and not a full URL - skip
            return null;
        })
        .filter((u): u is string => u !== null && (u.startsWith('http://') || u.startsWith('https://')));

    if (urls.length === 0) return result;

    const junctionService = new services.ItemsService(fieldConfig.junctionCollection, {
        schema: services.schema,
        accountability: services.accountability
    });

    // Get existing gallery items
    const existingItems = await junctionService.readByQuery({
        filter: { [fieldConfig.junctionField]: { _eq: parentItemId } },
        fields: ['id', fieldConfig.fileField, 'sort'],
        sort: ['-sort'],
        limit: -1
    });

    let startSort = 1;
    let existingFilenames: string[] = [];
    let hasCover = false;

    if (mode === 'replace') {
        // Delete all existing junction records (files stay in library)
        if (existingItems.length > 0) {
            const idsToDelete = existingItems.map((item: any) => item.id);
            await junctionService.deleteMany(idsToDelete);
        }
    } else if (mode === 'append') {
        // Start sort after existing items
        if (existingItems.length > 0) {
            startSort = Math.max(...existingItems.map((item: any) => item.sort || 0)) + 1;
            hasCover = true;  // Don't override existing cover
        }
    } else if (mode === 'skip_existing') {
        // Get filenames of existing files for comparison
        if (existingItems.length > 0) {
            const fileIds = existingItems.map((item: any) => item[fieldConfig.fileField]).filter(Boolean);
            if (fileIds.length > 0) {
                const filesService = services.filesService;
                const existingFiles = await filesService.readByQuery({
                    filter: { id: { _in: fileIds } },
                    fields: ['id', 'filename_download'],
                    limit: -1
                });
                existingFilenames = existingFiles.map((f: any) => f.filename_download?.toLowerCase()).filter(Boolean);
            }
            startSort = Math.max(...existingItems.map((item: any) => item.sort || 0)) + 1;
            hasCover = true;  // Don't override existing cover
        }
    }

    // Filter URLs for skip_existing mode first
    let urlsToProcess = urls;
    if (mode === 'skip_existing') {
        urlsToProcess = urls.filter(url => {
            const urlPath = new URL(url).pathname;
            let filename = urlPath.split('/').pop() || '';
            filename = filename.split('?')[0].toLowerCase();
            if (filename && existingFilenames.includes(filename)) {
                result.skipped++;
                return false;
            }
            return true;
        });
    }

    if (urlsToProcess.length === 0) return result;

    // Parallel upload with concurrency limit
    const CONCURRENCY = 5;
    const uploadResults: { url: string; fileId: string | null; error?: string }[] = [];

    for (let i = 0; i < urlsToProcess.length; i += CONCURRENCY) {
        const batch = urlsToProcess.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(async (url) => {
                try {
                    const fileId = await uploadImageFromUrl(
                        url,
                        services.filesService,
                        fieldConfig.folder || options.folder
                    );
                    return { url, fileId };
                } catch (error: any) {
                    return { url, fileId: null, error: error.message };
                }
            })
        );
        uploadResults.push(...batchResults);
    }

    // Create junction records sequentially to maintain order
    let sortOffset = 0;
    let firstSuccessful = true;

    for (const uploadResult of uploadResults) {
        if (!uploadResult.fileId) {
            result.errors.push(uploadResult.error
                ? `${uploadResult.url}: ${uploadResult.error}`
                : `Failed to upload: ${uploadResult.url}`);
            continue;
        }

        try {
            await junctionService.createOne({
                [fieldConfig.junctionField]: parentItemId,
                [fieldConfig.fileField]: uploadResult.fileId,
                sort: startSort + sortOffset,
                is_cover: !hasCover && firstSuccessful,
                tags: [],
            });

            sortOffset++;
            firstSuccessful = false;
            result.success++;
        } catch (error: any) {
            result.errors.push(`${uploadResult.url}: ${error.message}`);
        }
    }

    return result;
}

export type ProgressCallback = (progress: {
    current: number;
    total: number;
    success: number;
    errors: number;
    percent: number;
}) => void;

export async function runImport(
    itemsService: any,
    data: any[],
    options: ImportOptions,
    onProgress?: ProgressCallback,
    services?: ImportServices
): Promise<ImportReport> {
    let successCount = 0;
    let errorCount = 0;
    const details: any[] = [];
    const warnings: any[] = [];
    const isDryRun = options.dry_run === true;
    const total = data.length;

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        let transformedRow: Record<string, any> = {};
        const galleryData: Record<string, string> = {};

        try {
            // Apply mapping
            for (const [sourceKey, targetField] of Object.entries(options.mapping)) {
                if (!targetField) continue;
                if (options.selected_fields && !options.selected_fields.includes(targetField)) continue;

                // Check if this is a gallery field
                if (options.gallery_fields?.[targetField]) {
                    const rawValue = row[sourceKey];
                    if (rawValue && typeof rawValue === 'string' && rawValue.trim()) {
                        galleryData[targetField] = rawValue.trim();
                    }
                    continue;  // Don't add to transformedRow
                }

                const rawValue = row[sourceKey];
                const value = normalizeValue(rawValue);

                if (options.skip_empty_values) {
                    if (value === undefined || value === null || value === '') continue;
                    if (typeof value === 'string' && value.trim() === '') continue;
                }

                if (targetField.includes('.')) {
                    const parts = targetField.split('.');
                    let current = transformedRow;
                    for (let i = 0; i < parts.length - 1; i++) {
                        const part = parts[i];
                        if (!current[part]) current[part] = {};
                        current = current[part];
                    }
                    current[parts[parts.length - 1]] = value;
                } else {
                    transformedRow[targetField] = value;
                }
            }

            // Apply defaults
            if (options.defaults) {
                for (const [field, defaultValue] of Object.entries(options.defaults)) {
                    if (transformedRow[field] === undefined || transformedRow[field] === null || transformedRow[field] === '') {
                        transformedRow[field] = defaultValue;
                    }
                }
            }

            // Force publish if enabled
            if (options.force_publish) {
                transformedRow['status'] = 'published';
            }

            // Determine the value to match against
            let matchValue = null;
            if (options.mode === 'upsert' && options.match_field) {
                if (options.match_source) {
                    matchValue = row[options.match_source];
                } else if (transformedRow[options.match_field]) {
                    matchValue = transformedRow[options.match_field];
                }
            }

            if (Object.keys(transformedRow).length === 0 && !matchValue && Object.keys(galleryData).length === 0) {
                warnings.push({
                    row_index: rowIndex + 1,
                    warning: 'Empty row - skipped',
                    original_data: row
                });
                continue;
            }

            // Dry run mode - just validate, don't write
            if (isDryRun) {
                // Check for potential upsert match
                if (options.mode === 'upsert' && options.match_field && matchValue !== null && matchValue !== undefined) {
                    const existing = await itemsService.readByQuery({
                        filter: { [options.match_field]: { _eq: matchValue } },
                        limit: 1
                    });
                    if (existing && existing.length > 0) {
                        warnings.push({
                            row_index: rowIndex + 1,
                            warning: `Will UPDATE existing record (${options.match_field}=${matchValue})`,
                            original_data: row,
                            payload: transformedRow
                        });
                    } else {
                        warnings.push({
                            row_index: rowIndex + 1,
                            warning: 'Will CREATE new record',
                            original_data: row,
                            payload: transformedRow
                        });
                    }
                }
                // Add gallery info to dry run warnings
                if (Object.keys(galleryData).length > 0) {
                    const galleryInfo = Object.entries(galleryData).map(([field, urls]) => {
                        const delimiter = options.gallery_options?.delimiter || ',';
                        const count = urls.split(delimiter).filter(u => u.trim()).length;
                        return `${field}: ${count} image(s)`;
                    }).join(', ');
                    warnings.push({
                        row_index: rowIndex + 1,
                        warning: `Will import gallery: ${galleryInfo}`,
                        original_data: row,
                        payload: transformedRow
                    });
                }
                successCount++;
                continue;
            }

            // Actual import
            let itemId: string | number | undefined;

            if (options.mode === 'upsert' && options.match_field && matchValue !== null && matchValue !== undefined) {
                const existing = await itemsService.readByQuery({
                    filter: { [options.match_field]: { _eq: matchValue } },
                    limit: 1
                });

                if (existing && existing.length > 0) {
                    itemId = existing[0].id;
                    if (Object.keys(transformedRow).length > 0) {
                        await itemsService.updateOne(itemId, transformedRow);
                    }
                } else {
                    if (Object.keys(transformedRow).length > 0) {
                        itemId = await itemsService.createOne(transformedRow);
                    }
                }
            } else {
                if (Object.keys(transformedRow).length > 0) {
                    itemId = await itemsService.createOne(transformedRow);
                }
            }

            // Process gallery fields after main item is created/updated
            if (services && itemId && Object.keys(galleryData).length > 0) {
                for (const [fieldName, urlsString] of Object.entries(galleryData)) {
                    const fieldConfig = options.gallery_fields![fieldName];

                    const galleryResult = await processGalleryField(
                        urlsString,
                        fieldConfig,
                        itemId,
                        services,
                        options.gallery_options || { delimiter: ',' }
                    );

                    // Report gallery results as warnings
                    if (galleryResult.errors.length > 0 || galleryResult.skipped > 0) {
                        const parts = [];
                        if (galleryResult.success > 0) parts.push(`${galleryResult.success} uploaded`);
                        if (galleryResult.skipped > 0) parts.push(`${galleryResult.skipped} skipped`);
                        if (galleryResult.errors.length > 0) parts.push(`errors: ${galleryResult.errors.join('; ')}`);
                        warnings.push({
                            row_index: rowIndex + 1,
                            warning: `Gallery "${fieldName}": ${parts.join(', ')}`,
                            original_data: row
                        });
                    }
                }
            }

            successCount++;
        } catch (error: any) {
            errorCount++;
            details.push({
                row_index: rowIndex + 1,
                error: getErrorMessage(error),
                code: error.code || error.extensions?.code,
                validation: error.extensions?.errors || error.errors,
                original_data: row,
                payload_sent: transformedRow
            });
        }

        // Send progress update
        if (onProgress) {
            onProgress({
                current: rowIndex + 1,
                total,
                success: successCount,
                errors: errorCount,
                percent: Math.round(((rowIndex + 1) / total) * 100)
            });
        }
    }

    return {
        success: successCount,
        errors: errorCount,
        details,
        dry_run: isDryRun,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

function getErrorMessage(error: any): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;

    // Directus standard error format (array)
    if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
        const firstError = error.errors[0];

        // Handle FAILED_VALIDATION specifically
        if (firstError.code === 'FAILED_VALIDATION' && firstError.extensions) {
            const { field, type, invalid } = firstError.extensions;
            return `Validation failed for field "${field}" (${type}). Invalid value: "${invalid}"`;
        }

        return firstError.message || JSON.stringify(firstError);
    }

    // Standard JS error
    if (error.message) return error.message;

    // Fallback
    return JSON.stringify(error);
}
