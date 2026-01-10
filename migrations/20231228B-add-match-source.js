
module.exports = {
    async up(knex) {
        // Check if column exists first to be safe, though migration system should handle order
        const hasColumn = await knex.schema.hasColumn('directus_import_profiles', 'match_source');
        if (!hasColumn) {
            await knex.schema.table('directus_import_profiles', (table) => {
                table.string('match_source');
            });
        }
    },

    async down(knex) {
        await knex.schema.table('directus_import_profiles', (table) => {
            table.dropColumn('match_source');
        });
    }
};
