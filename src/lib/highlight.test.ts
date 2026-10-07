import { describe, expect, it } from 'vitest'
import { highlightJson } from './highlight'

// highlightJson's output is injected with dangerouslySetInnerHTML (Inspector.tsx),
// and the JSON it receives carries text taken from untrusted documents: PDF text
// layers, OCR output, file names and PDF metadata. These tests pin the escaping.

/** Remove the highlighter's own spans; anything left must be plain escaped text. */
const stripSpans = (html: string): string =>
  html.replace(/<span class="j-(?:key|str|num|bool|null)">/g, '').replace(/<\/span>/g, '')

const decodeEntities = (text: string): string =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

describe('highlightJson', () => {
  it('wraps keys, strings, numbers, booleans and null in classed spans', () => {
    const html = highlightJson('{"name": "x", "n": -1.5e3, "ok": true, "off": false, "none": null}')
    expect(html).toContain('<span class="j-key">"name"</span>:')
    expect(html).toContain('<span class="j-str">"x"</span>')
    expect(html).toContain('<span class="j-num">-1.5e3</span>')
    expect(html).toContain('<span class="j-bool">true</span>')
    expect(html).toContain('<span class="j-bool">false</span>')
    expect(html).toContain('<span class="j-null">null</span>')
  })

  it('keeps a string with escaped quotes as a single token', () => {
    const html = highlightJson(JSON.stringify({ quote: 'say "hi"' }))
    expect(html).toContain('<span class="j-str">"say \\"hi\\""</span>')
  })

  it('escapes markup inside string values', () => {
    const html = highlightJson(JSON.stringify({ text: '<script>alert(1)</script>' }))
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('escapes markup inside keys', () => {
    const html = highlightJson(JSON.stringify({ '<img src=x onerror=alert(1)>': 1 }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes ampersands so entity-looking text stays text', () => {
    const html = highlightJson(JSON.stringify({ text: '&lt;b&gt; & &#x3C;i&#x3E;' }))
    expect(html).toContain('&amp;lt;b&amp;gt; &amp; &amp;#x3C;i&amp;#x3E;')
  })

  it('emits no tags other than its own spans, even for hostile input', () => {
    const json = JSON.stringify(
      {
        '</span><svg onload=alert(1)>': '"><iframe src=javascript:alert(1)>',
        fileName: '<a href="javascript:alert(1)">x</a>.pdf',
        rows: [['<td>', '</code></pre><script>1</script>'], [1, true, null]],
      },
      null,
      2,
    )
    const rest = stripSpans(highlightJson(json))
    expect(rest).not.toMatch(/[<>]/)
    // Nothing is lost: undoing the escaping gives back the original JSON text.
    expect(decodeEntities(rest)).toBe(json)
  })

  it('stays escaped when the JSON is cut off mid-string (preview truncation)', () => {
    const json = JSON.stringify({ text: 'before <script>alert(1)</script> after' })
    const truncated = json.slice(0, json.indexOf('alert') + 3)
    const rest = stripSpans(highlightJson(truncated))
    expect(rest).not.toMatch(/[<>]/)
    expect(decodeEntities(rest)).toBe(truncated)
  })
})
