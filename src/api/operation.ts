import { defineOperationApi } from '@directus/extensions-sdk';
import { fetchData } from './fetcher';
import { parseData } from './parser';
import { runImport } from './importer';

export default defineOperationApi({
    id: 'import-from-url-op',
    handler: async ({ profile_id, url: urlOverride }, { services, schema, accountability }) => {
        const { ItemsService } = services;

        const profilesService = new ItemsService('directus_import_profiles', { schema, accountability });
        const jobsService = new ItemsService('directus_import_jobs', { schema, accountability });

        let profile;
        if (profile_id) {
            profile = await profilesService.readOne(profile_id);
        }

        if (!profile && !urlOverride) throw new Error('Either Profile ID or URL must be provided');

        const finalUrl = urlOverride || profile.url;
        const { data } = await fetchData(finalUrl);
        const parsed = parseData(data, {
            delimiter: profile?.delimiter || 'auto',
            hasHeader: profile?.has_header ?? true
        });

        const collection = profile?.collection;
        if (!collection) throw new Error('Collection not found in profile and not provided');

        const targetService = new ItemsService(collection, { schema, accountability });

        const report = await runImport(targetService, parsed.rows, {
            collection: collection,
            mapping: profile?.mapping || {},
            mode: profile?.mode || 'insert',
            match_field: profile?.match_field,
            selected_fields: profile?.selected_fields,
            skip_empty_values: profile?.skip_empty_values
        });

        // Log job if profile exists
        if (profile_id) {
            await jobsService.createOne({
                profile_id: profile_id,
                status: report.errors > 0 ? 'error' : 'success',
                report: report
            });
        }

        return report;
    },
});
