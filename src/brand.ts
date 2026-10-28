/**
 * Product branding: the one place to rename or white-label the UI.
 *
 * BlueSec is the vendor; the product is named Nightshift alone and has its own logo, in the app and on
 * PDF reports. Everything user-facing
 * (page title, header, PDF exports) reads from here instead of hardcoding names.
 */
export const BRAND = {
    vendor: 'BlueSec',
    product: 'Nightshift',
    fullName: 'Nightshift',
    tagline: 'The AI analyst that never clocks out',
    /** Product logo, navy version for light backgrounds: PDF reports. */
    logo: '/assets/nightshift-logo-dark.png',
    /** Product logo, white version for the dark interface: the moon-and-hat mark, then the name. */
    productLogo: '/assets/NightShift%20Light.png',
    /** Prefix for this app's localStorage keys. */
    storagePrefix: 'nightshift_',
} as const;
