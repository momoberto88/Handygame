declare module 'virtual:clip-versions' {
  /** Short content hash of every audio clip ("voice/hase/win-0" → "1a2b3c4d"). */
  const versions: Record<string, string>;
  export default versions;
}
