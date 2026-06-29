import { defineEndpoint } from '@directus/extensions-sdk';
import { fetchData } from './fetcher';
import { parseData } from './parser';
import { readFileBuffer } from './storage';
import { runImport } from './importer';

export default defineEndpoint((router, { services, database }) => {
    const { ItemsService, FilesService } = services;

    /**
     * Resolve the raw source bytes from either a remote URL or an uploaded
     * Directus file. `source_type === 'file'` + `file_id` reads from storage;
     * everything else falls back to the URL fetcher.
     */
    const getSourceData = async (
        source: { source_type?: string; url?: string; file_id?: string },
        req: any
    ): Promise<string | Buffer> => {
        if (source.source_type === 'file' && source.file_id) {
            return await readFileBuffer(source.file_id, {
                services,
                schema: req.schema,
                accountability: req.accountability,
            });
        }
        if (!source.url) throw new Error('URL or uploaded file is required');
        const { data } = await fetchData(source.url);
        return data;
    };

    // Auto-install: Check if tables exist, if not create them
    const install = async () => {
        try {
            const hasProfiles = await database.schema.hasTable('directus_import_profiles');
            if (!hasProfiles) {
                await database.schema.createTable('directus_import_profiles', (table) => {
                    table.uuid('id').primary().defaultTo(database.raw('gen_random_uuid()'));
                    table.string('name').notNullable();
                    table.string('collection').notNullable();
                    table.boolean('enabled').defaultTo(true);
                    table.string('source_type').defaultTo('url');
                    table.text('url');
                    table.uuid('file_id');
                    table.string('format').defaultTo('auto');
                    table.string('delimiter').defaultTo('auto');
                    table.boolean('has_header').defaultTo(true);
                    table.string('encoding').defaultTo('auto');
                    table.json('mapping');
                    table.json('selected_fields');
                    table.boolean('skip_unknown_columns').defaultTo(true);
                    table.boolean('skip_empty_values').defaultTo(true);
                    table.boolean('force_publish').defaultTo(false);
                    table.string('mode').defaultTo('insert');
                    table.string('match_field');
                    table.string('conflict_strategy').defaultTo('update');
                    table.json('transforms');
                    table.dateTime('last_run');
                    table.string('last_status');
                    table.json('last_report');
                    table.string('match_source'); // Ensure this is added
                    table.json('defaults');
                    table.timestamp('date_created').defaultTo(database.fn.now());
                    table.timestamp('date_updated').defaultTo(database.fn.now());
                });
            } else {
                const hasMatchSource = await database.schema.hasColumn('directus_import_profiles', 'match_source');
                if (!hasMatchSource) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.string('match_source');
                    });
                }

                const hasSkipEmpty = await database.schema.hasColumn('directus_import_profiles', 'skip_empty_values');
                if (!hasSkipEmpty) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.boolean('skip_empty_values').defaultTo(true);
                    });
                }

                const hasForcePublish = await database.schema.hasColumn('directus_import_profiles', 'force_publish');
                if (!hasForcePublish) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.boolean('force_publish').defaultTo(false);
                    });
                }

                const hasSheetName = await database.schema.hasColumn('directus_import_profiles', 'sheet_name');
                if (!hasSheetName) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.string('sheet_name');
                    });
                }

                const hasDefaults = await database.schema.hasColumn('directus_import_profiles', 'defaults');
                if (!hasDefaults) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.json('defaults');
                    });
                }

                const hasGalleryOptions = await database.schema.hasColumn('directus_import_profiles', 'gallery_options');
                if (!hasGalleryOptions) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.json('gallery_options');
                    });
                }

                const hasGalleryFields = await database.schema.hasColumn('directus_import_profiles', 'gallery_fields');
                if (!hasGalleryFields) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.json('gallery_fields');
                    });
                }

                const hasSourceType = await database.schema.hasColumn('directus_import_profiles', 'source_type');
                if (!hasSourceType) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.string('source_type').defaultTo('url');
                    });
                }

                const hasEncoding = await database.schema.hasColumn('directus_import_profiles', 'encoding');
                if (!hasEncoding) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.string('encoding').defaultTo('auto');
                    });
                }

                const hasFileId = await database.schema.hasColumn('directus_import_profiles', 'file_id');
                if (!hasFileId) {
                    await database.schema.table('directus_import_profiles', (table) => {
                        table.uuid('file_id');
                    });
                }
            }

            const hasJobs = await database.schema.hasTable('directus_import_jobs');
            if (!hasJobs) {
                await database.schema.createTable('directus_import_jobs', (table) => {
                    table.uuid('id').primary().defaultTo(database.raw('gen_random_uuid()'));
                    table.uuid('profile_id').references('id').inTable('directus_import_profiles').onDelete('SET NULL');
                    table.string('status');
                    table.json('report');
                    table.timestamp('date_created').defaultTo(database.fn.now());
                });
            }
        } catch (error) {
            console.error('Import Extension Install Failed:', error);
        }
    };

    // Run install on init
    install();

    router.get('/', (req, res) => res.send('Import From URL API is running'));

    // Uninstall endpoint - ADMIN ONLY
    router.delete('/uninstall', async (req, res) => {
        // Check admin permission
        const accountability = (req as any).accountability;
        if (!accountability?.admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        try {
            await database.schema.dropTableIfExists('directus_import_jobs');
            await database.schema.dropTableIfExists('directus_import_profiles');

            // Clean up Directus metadata
            await database('directus_fields').whereIn('collection', ['directus_import_profiles', 'directus_import_jobs']).delete();
            await database('directus_collections').whereIn('collection', ['directus_import_profiles', 'directus_import_jobs']).delete();
            await database('directus_relations').whereIn('many_collection', ['directus_import_profiles', 'directus_import_jobs']).delete();

            res.json({ success: true, message: 'Extension data uninstalled' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Preview from URL
    router.post('/preview', async (req, res, next) => {
        try {
            const { url, delimiter, has_header, sheet_name, encoding, source_type, file_id } = req.body;

            const data = await getSourceData({ source_type, url, file_id }, req);
            const result = parseData(data, {
                delimiter,
                hasHeader: has_header,
                sheetName: sheet_name,
                encoding
            });

            res.json({
                headers: result.headers,
                preview: result.rows.slice(0, 10), // Return only N rows for preview
                total_detected: result.rows.length,
                sheets: result.sheets || [],
                current_sheet: result.currentSheet
            });
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    });

    // Run import from raw config (Wizard) - with SSE progress
    router.post('/run', async (req, res) => {
        const useSSE = req.query.sse === 'true';

        if (useSSE) {
            // SSE mode for real-time progress
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
        }

        try {
            const {
                collection, url, mapping, mode, match_field, match_source,
                skip_empty_values, force_publish, defaults, delimiter, has_header, sheet_name, dry_run,
                gallery_options, gallery_fields, encoding, source_type, file_id
            } = req.body;

            const service = new ItemsService(collection, { schema: (req as any).schema, accountability: (req as any).accountability });
            const data = await getSourceData({ source_type, url, file_id }, req);

            const parsed = parseData(data, {
                delimiter,
                hasHeader: has_header,
                sheetName: sheet_name,
                encoding
            });

            const onProgress = useSSE ? (progress: any) => {
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
            } : undefined;

            // Create FilesService for gallery imports
            const filesService = new FilesService({
                schema: (req as any).schema,
                accountability: (req as any).accountability
            });

            const report = await runImport(service, parsed.rows, {
                collection, mapping, mode, match_field, match_source,
                skip_empty_values, force_publish, defaults, dry_run,
                gallery_fields, gallery_options
            }, onProgress, {
                filesService,
                ItemsService,
                schema: (req as any).schema,
                accountability: (req as any).accountability
            });

            if (useSSE) {
                res.write(`data: ${JSON.stringify({ ...report, done: true })}\n\n`);
                res.end();
            } else {
                res.json(report);
            }
        } catch (error: any) {
            if (useSSE) {
                res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
                res.end();
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    });

    // Run import for a specific profile - with SSE progress
    router.post('/profiles/:id/run', async (req, res, next) => {
        const useSSE = req.query.sse === 'true';

        if (useSSE) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
        }

        try {
            const profileId = req.params.id;
            const profilesService = new ItemsService('directus_import_profiles', { schema: (req as any).schema, accountability: (req as any).accountability });
            const jobsService = new ItemsService('directus_import_jobs', { schema: (req as any).schema, accountability: (req as any).accountability });

            const profile = await profilesService.readOne(profileId);
            if (!profile) throw new Error(`Profile ${profileId} not found`);

            const data = await getSourceData(
                { source_type: profile.source_type, url: profile.url, file_id: profile.file_id },
                req
            );
            const parsed = parseData(data, {
                delimiter: profile.delimiter,
                hasHeader: profile.has_header,
                sheetName: profile.sheet_name,
                encoding: profile.encoding
            });

            const targetService = new ItemsService(profile.collection, { schema: (req as any).schema, accountability: (req as any).accountability });

            const onProgress = useSSE ? (progress: any) => {
                res.write(`data: ${JSON.stringify(progress)}\n\n`);
            } : undefined;

            // Create FilesService for gallery imports
            const filesService = new FilesService({
                schema: (req as any).schema,
                accountability: (req as any).accountability
            });

            const report = await runImport(targetService, parsed.rows, {
                collection: profile.collection,
                mapping: profile.mapping,
                mode: profile.mode,
                match_field: profile.match_field,
                match_source: profile.match_source,
                selected_fields: profile.selected_fields,
                skip_empty_values: profile.skip_empty_values,
                force_publish: profile.force_publish,
                defaults: profile.defaults,
                gallery_fields: profile.gallery_fields,
                gallery_options: profile.gallery_options
            }, onProgress, {
                filesService,
                ItemsService,
                schema: (req as any).schema,
                accountability: (req as any).accountability
            });

            // Update profile stats
            await profilesService.updateOne(profileId, {
                last_run: new Date(),
                last_status: report.errors > 0 ? 'warning' : 'success',
                last_report: report
            });

            // Create job entry
            await jobsService.createOne({
                profile_id: profileId,
                status: report.errors > 0 ? 'error' : 'success',
                report: report
            });

            if (useSSE) {
                res.write(`data: ${JSON.stringify({ ...report, done: true })}\n\n`);
                res.end();
            } else {
                res.json(report);
            }
        } catch (error: any) {
            if (useSSE) {
                res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
                res.end();
            } else {
                return res.status(500).json({ error: error.message });
            }
        }
    });
});

