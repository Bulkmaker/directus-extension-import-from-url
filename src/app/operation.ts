import { defineOperationApp } from '@directus/extensions-sdk';

export default defineOperationApp({
    id: 'import-from-url-op',
    name: 'Import from URL',
    icon: 'import_export',
    description: 'Import data from a URL (CSV/TSV/Google Sheets)',
    overview: ({ profile_id, collection }) => [
        {
            label: 'Profile',
            text: profile_id || 'Manual configuration',
        },
        {
            label: 'Collection',
            text: collection || 'From profile',
        },
    ],
    options: [
        {
            field: 'profile_id',
            name: 'Import Profile',
            type: 'string',
            meta: {
                width: 'full',
                interface: 'select-dropdown-m2o',
                options: {
                    template: '{{name}}',
                    collection: 'directus_import_profiles',
                },
            },
        },
        {
            field: 'url',
            name: 'URL (Override)',
            type: 'string',
            meta: {
                width: 'full',
                interface: 'input',
            },
        },
    ],
});
