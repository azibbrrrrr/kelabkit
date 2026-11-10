/** Lower-case, collapse spaces and drop honorifics, so "Cikgu  Aina" matches "aina". */
export function normaliseName(name: string) {
  return name
    .toLowerCase()
    .replace(/^(cikgu|puan|encik|en\.|pn\.|tuan|dr\.?|ustaz|ustazah)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
