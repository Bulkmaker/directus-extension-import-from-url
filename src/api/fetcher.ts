import axios from 'axios';
import { validateUrl, validateResolvedIP, transformGoogleSheetsUrl, ForbiddenError } from './security';

export async function fetchData(url: string): Promise<{ data: string | Buffer; contentType: string }> {
    const finalUrl = transformGoogleSheetsUrl(url);
    validateUrl(finalUrl);

    // Validate resolved IP to prevent DNS rebinding attacks
    const hostname = new URL(finalUrl).hostname;
    await validateResolvedIP(hostname);

    const response = await axios.get(finalUrl, {
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024, // 50MB
        responseType: 'arraybuffer', // Get raw buffer to support binary files like XLSX
        maxRedirects: 5, // Limit redirects
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        // Validate each redirect URL before following
        beforeRedirect: (options: any) => {
            const redirectUrl = options.href || options.url;
            if (redirectUrl) {
                try {
                    validateUrl(redirectUrl);
                } catch (e) {
                    throw new ForbiddenError(`Redirect to forbidden URL blocked: ${redirectUrl}`);
                }
            }
        }
    });

    return {
        data: response.data, // This will be a Buffer
        contentType: response.headers['content-type'] || '',
    };
}
