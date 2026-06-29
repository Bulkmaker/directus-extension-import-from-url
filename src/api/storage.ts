/**
 * Read the raw contents of a file stored in Directus (directus_files) by its id.
 *
 * Uses AssetsService so it works regardless of the configured storage driver
 * (local, S3, …) and respects the caller's permissions. Returns a Buffer ready
 * to be handed to parseData().
 */
export interface StorageContext {
    services: any;
    schema: any;
    accountability: any;
}

export async function readFileBuffer(fileId: string, ctx: StorageContext): Promise<Buffer> {
    const { AssetsService } = ctx.services;
    if (!AssetsService) {
        throw new Error('AssetsService is not available in this Directus version');
    }

    const assets = new AssetsService({
        schema: ctx.schema,
        accountability: ctx.accountability,
    });

    // No transformation — we want the original file bytes.
    const { stream } = await assets.getAsset(fileId, {});

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
