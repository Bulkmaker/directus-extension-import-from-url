import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
    id: 'import-from-url',
    name: 'Import from URL',
    icon: 'import_export',
    routes: [
        {
            path: '',
            component: ModuleComponent,
        },
    ],
});
