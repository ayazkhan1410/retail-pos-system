/** Internal shop barcodes start with 2 (not factory/OEM). */
const INTERNAL_PREFIX = '2';

export function isInternalBarcode(code: string): boolean {
  return code.trim().startsWith(INTERNAL_PREFIX);
}

/** Generate a 12-digit internal barcode: 2 + 11 random digits. */
export function generateInternalBarcode(): string {
  const suffix = String(Math.floor(Math.random() * 1_000_000_00000)).padStart(11, '0');
  return `${INTERNAL_PREFIX}${suffix}`;
}

export const LABEL_WIDTH_MM = 50;
export const LABEL_HEIGHT_MM = 25;
export const LABEL_DPI = 203;
