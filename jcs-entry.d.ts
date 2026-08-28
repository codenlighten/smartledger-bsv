/**
 * RFC 8785 (JSON Canonicalization Scheme).
 *
 * Object keys sort by UTF-16 code unit, applied during serialization rather than by
 * rebuilding an object — rebuilding lets V8 reorder integer-like keys ahead of the
 * sort, producing `{"2":…,"10":…}` where the RFC requires `{"10":…,"2":…}`.
 *
 * Throws on non-finite numbers, bigint, circular structures, and values with no JSON
 * representation, rather than coercing them: a canonicalizer that silently serializes
 * a different document than the one supplied defeats its own purpose.
 */
export declare function stringify(value: any): string;
