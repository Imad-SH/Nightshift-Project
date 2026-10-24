/**
 * Product branding: the one place to rename or white-label the UI.
 *
 * BlueSec is the vendor (its logo is shown); the product is named Nightshift alone. Everything user-facing
 * (page title, header, PDF exports) reads from here instead of hardcoding names.
 */
export const BRAND = {
    vendor: 'BlueSec',
    product: 'Nightshift',
    fullName: 'Nightshift',
    tagline: 'The AI analyst that never clocks out',
    logo: '/assets/bluesec-logo.png',
    /** Prefix for this app's localStorage keys. */
    storagePrefix: 'nightshift_',
} as const;
