
module.exports = {
    async up(knex) {
        await knex.schema.createTable('directus_import_profiles', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.string('name').notNullable();
            table.string('collection').notNullable();
            table.boolean('enabled').defaultTo(true);

            // Source
            table.string('source_type').defaultTo('url'); // url | google_sheets
            table.text('url');
            table.string('format').defaultTo('auto');
            table.string('delimiter').defaultTo('auto');
            table.boolean('has_header').defaultTo(true);
            table.string('encoding').defaultTo('auto');

            // Mapping & selection
            table.json('mapping');
            table.json('selected_fields');
            table.boolean('skip_unknown_columns').defaultTo(true);
            table.boolean('skip_empty_values').defaultTo(false);

            // Mode
            table.string('mode').defaultTo('insert'); // insert | upsert
            table.string('match_field');
            table.string('conflict_strategy').defaultTo('update');

            // Transforms
            table.json('transforms');

            // Last run stats
            table.dateTime('last_run');
            table.string('last_status');
            table.json('last_report');

            table.timestamp('date_created').defaultTo(knex.fn.now());
            table.timestamp('date_updated').defaultTo(knex.fn.now());
        });

        await knex.schema.createTable('directus_import_jobs', (table) => {
            table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
            table.uuid('profile_id').references('id').inTable('directus_import_profiles').onDelete('SET NULL');
            table.string('status');
            table.json('report');
            table.timestamp('date_created').defaultTo(knex.fn.now());
        });
    },

    async down(knex) {
        await knex.schema.dropTable('directus_import_jobs');
        await knex.schema.dropTable('directus_import_profiles');
    }
};
