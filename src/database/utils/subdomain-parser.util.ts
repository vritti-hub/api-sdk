/**
 * Extract subdomain from hostname
 *
 * @param host Full hostname (e.g., 'acme.vritti.com:3000' or 'acme.vritti.com')
 * @returns Subdomain or null if not found
 *
 * @example
 * extractSubdomain('acme.vritti.com') // 'acme'
 * extractSubdomain('staging-acme.vritti.com') // 'staging-acme'
 * extractSubdomain('localhost') // null
 * extractSubdomain('vritti.com') // null
 */
export function extractSubdomain(host: string): string | null {
  if (!host) {
    return null;
  }

  // Remove port if present: acme.vritti.com:3000 → acme.vritti.com
  const hostname = host.split(':')[0];

  if (!hostname) {
    return null;
  }

  // Split by dots
  const parts = hostname.split('.');

  // Need at least 3 parts for subdomain (subdomain.domain.tld)
  if (parts.length < 3) {
    return null;
  }

  // Return first part as subdomain
  return parts[0] ?? null;
}
