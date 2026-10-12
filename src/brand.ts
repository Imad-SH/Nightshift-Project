/**
 * Product branding: the one place to rename or white-label the UI.
 *
 * BlueSec is the vendor; Nightshift is the product. Everything user-facing
 * (page title, header, PDF exports) reads from here instead of hardcoding names.
 */
export const BRAND = {
    vendor: 'BlueSec',
    product: 'Nightshift',
    fullName: 'BlueSec Nightshift',
    tagline: 'The AI analyst that never clocks out',
    logo: '/assets/bluesec-logo.png',
    /** Prefix for this app's localStorage keys. */
    storagePrefix: 'nightshift_',
} as const;
