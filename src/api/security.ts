import * as dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForbiddenError';
    }
}

/**
 * Check if an IP address is in a private/reserved range
 */
function isPrivateIP(hostname: string): boolean {
    // Localhost variations
    if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.startsWith('127.')
    ) {
        return true;
    }

    // Private IP ranges
    // 10.0.0.0/8
    if (hostname.startsWith('10.')) {
        return true;
    }

    // 192.168.0.0/16
    if (hostname.startsWith('192.168.')) {
        return true;
    }

    // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (hostname.startsWith('172.')) {
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            const second = parseInt(parts[1], 10);
            if (second >= 16 && second <= 31) {
                return true;
            }
        }
    }

    // Link-local 169.254.0.0/16
    if (hostname.startsWith('169.254.')) {
        return true;
    }

    // IPv6 link-local
    if (hostname.toLowerCase().startsWith('fe80:')) {
        return true;
    }

    // IPv6 unique local addresses (fc00::/7, fd00::/8)
    // Only block if it looks like an IPv6 address (contains colons or brackets)
    const lowerHost = hostname.toLowerCase();
    if ((lowerHost.startsWith('fc') || lowerHost.startsWith('fd')) &&
        (lowerHost.includes(':') || lowerHost.startsWith('['))) {
        return true;
    }

    // IPv4-mapped IPv6 addresses (::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.)
    if (lowerHost.startsWith('::ffff:') || lowerHost.startsWith('[::ffff:')) {
        const ipv4Part = hostname.replace(/^\[?::ffff:/i, '').replace(/\]$/, '');
        // Recursively check the IPv4 part
        if (ipv4Part.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            if (
                ipv4Part.startsWith('127.') ||
                ipv4Part.startsWith('10.') ||
                ipv4Part.startsWith('192.168.') ||
                ipv4Part.startsWith('169.254.') ||
                ipv4Part === '0.0.0.0'
            ) {
                return true;
            }
            // Check 172.16.0.0/12
            if (ipv4Part.startsWith('172.')) {
                const parts = ipv4Part.split('.');
                const second = parseInt(parts[1], 10);
                if (second >= 16 && second <= 31) return true;
            }
        }
    }

    // Block 0.0.0.0
    if (hostname === '0.0.0.0') {
        return true;
    }

    // Internal/local domain patterns
    const internalPatterns = ['.local', '.internal', '.localhost', '.lan', '.home'];
    const lowerHostname = hostname.toLowerCase();
    for (const pattern of internalPatterns) {
        if (lowerHostname.endsWith(pattern)) {
            return true;
        }
    }

    return false;
}

export function validateUrl(url: string): void {
    try {
        const parsedUrl = new URL(url);

        // Only allow HTTP/HTTPS
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new ForbiddenError('Only HTTP/HTTPS protocols are allowed');
        }

        // Block private/internal IPs
        const hostname = parsedUrl.hostname;
        if (isPrivateIP(hostname)) {
            throw new ForbiddenError('Private/internal addresses are not allowed');
        }

        // Block common metadata endpoints
        if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
            throw new ForbiddenError('Cloud metadata endpoints are not allowed');
        }

    } catch (error) {
        if (error instanceof ForbiddenError) throw error;
        throw new ForbiddenError('Invalid URL format');
    }
}

/**
 * Resolve DNS and validate that the resolved IP is not private.
 * This prevents DNS rebinding attacks where a domain initially resolves
 * to a public IP (passing validation) but then resolves to a private IP
 * when the actual request is made.
 */
export async function validateResolvedIP(hostname: string): Promise<void> {
    // Skip validation for IP addresses (already validated by isPrivateIP)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        hostname.includes(':') || hostname.startsWith('[')) {
        return;
    }

    try {
        const result = await dnsLookup(hostname, { all: true });
        const addresses = Array.isArray(result) ? result : [result];

        for (const addr of addresses) {
            const ip = typeof addr === 'string' ? addr : addr.address;
            if (isPrivateIP(ip)) {
                throw new ForbiddenError(`DNS resolved to private IP: ${ip}`);
            }
        }
    } catch (error) {
        if (error instanceof ForbiddenError) throw error;
        // DNS resolution failed - could be temporary, let the request fail naturally
        // Don't block legitimate domains that have DNS issues
    }
}

export function transformGoogleSheetsUrl(url: string): string {
    // Convert Google Sheets URL to CSV export URL
    // Examples:
    // https://docs.google.com/spreadsheets/d/ID/edit#gid=0 -> https://docs.google.com/spreadsheets/d/ID/export?format=csv&gid=0
    // https://docs.google.com/spreadsheets/d/ID/edit?usp=sharing -> https://docs.google.com/spreadsheets/d/ID/export?format=csv

    if (!url.includes('docs.google.com/spreadsheets/d/')) {
        return url;
    }

    try {
        const parts = url.split('/edit');
        if (parts.length < 2) return url;

        const baseUrl = parts[0];
        const hashParams = new URL(url).hash.replace('#', '');
        const queryParams = new URL(url).searchParams;

        let exportUrl = `${baseUrl}/export?format=csv`;

        if (hashParams.includes('gid=')) {
            const gid = hashParams.split('gid=')[1].split('&')[0];
            exportUrl += `&gid=${gid}`;
        } else if (queryParams.has('gid')) {
            exportUrl += `&gid=${queryParams.get('gid')}`;
        }

        return exportUrl;
    } catch (e) {
        return url;
    }
}
