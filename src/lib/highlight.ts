const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

/** Escape then wrap JSON tokens in classed spans for syntax coloring. */
export function highlightJson(json: string): string {
  return escapeHtml(json).replace(TOKEN, (match, str: string | undefined, colon: string | undefined) => {
    if (str !== undefined) {
      return colon !== undefined
        ? `<span class="j-key">${str}</span>${colon}`
        : `<span class="j-str">${str}</span>`
    }
    if (match === 'true' || match === 'false') return `<span class="j-bool">${match}</span>`
    if (match === 'null') return `<span class="j-null">${match}</span>`
    return `<span class="j-num">${match}</span>`
  })
}
