import crypto from 'crypto';

/**
 * Generate a canonical ID for a topic based on title and source.
 * Used for deduplication across the pipeline.
 *
 * Two topics with the same title and source will have the same canonical_id,
 * making it easy to detect and merge duplicates.
 */
export function generateCanonicalId(title: string, source?: string | null): string {
  const normalized = (title || '').toLowerCase().trim();
  const sourceNorm = (source || '').toLowerCase().trim();
  const combined = `${normalized}|${sourceNorm}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

/**
 * Validate that a topic's canonical_id is correct.
 * Used for integrity checks.
 */
export function validateCanonicalId(title: string, source: string | null | undefined, storedId: string): boolean {
  return generateCanonicalId(title, source) === storedId;
}
