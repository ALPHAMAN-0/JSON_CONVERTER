import { useMemo, useState } from 'react'
import { downloadJson } from '../lib/exporter'
import { highlightJson } from '../lib/highlight'
import type { FileState, TreeNode } from '../types'

const DISPLAY_CAP = 400_000

interface Props {
  node: TreeNode | null
  state?: FileState
}

export function Inspector({ node, state }: Props) {
  const [copied, setCopied] = useState(false)

  const json = useMemo(
    () => (state?.result ? JSON.stringify(state.result, null, 2) : null),
    [state?.result],
  )

  const html = useMemo(() => {
    if (!json) return null
    const capped = json.length > DISPLAY_CAP
    return {
      __html: highlightJson(capped ? json.slice(0, DISPLAY_CAP) : json),
      capped,
    }
  }, [json])

  if (!node || !state) {
    return (
      <div className="inspector-empty">
        <p className="empty-glyph" aria-hidden="true">{'{ }'}</p>
        <p className="empty-line">
          AWAITING INPUT<span className="caret">_</span>
        </p>
      </div>
    )
  }

  if (state.status === 'queued' || state.status === 'processing') {
    const pct = Math.round((state.progress ?? 0) * 100)
    return (
      <div className="inspector-empty">
        <p className="empty-line">
          {state.status === 'queued' ? 'QUEUED' : `CONVERTING ${pct}%`}
          <span className="caret">_</span>
        </p>
        {state.progressLabel && <p className="empty-sub">{state.progressLabel}</p>}
        <div className="bigbar">
          <div className="bigbar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="inspector-empty">
        <p className="empty-line err">CONVERSION FAILED</p>
        <p className="empty-sub">{state.error}</p>
      </div>
    )
  }

  if (state.status === 'skipped' || !state.result || !json || !html) {
    return (
      <div className="inspector-empty">
        <p className="empty-line">UNSUPPORTED FILE TYPE</p>
        <p className="empty-sub">only PDF and image files are converted</p>
      </div>
    )
  }

  const { stats, document: doc } = state.result

  const copy = (): void => {
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="inspector">
      <div className="inspector-bar">
        <div className="chips">
          <span className="chip">{doc.pageCount}p</span>
          <span className="chip">{stats.blocks} blocks</span>
          <span className="chip">{stats.words} words</span>
          {stats.headings > 0 && <span className="chip">{stats.headings} headings</span>}
          {stats.keyValues > 0 && <span className="chip">{stats.keyValues} key-values</span>}
          {stats.tables > 0 && <span className="chip">{stats.tables} tables</span>}
          {stats.listItems > 0 && <span className="chip">{stats.listItems} list items</span>}
        </div>
        <div className="inspector-actions">
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
          <button type="button" className="btn btn-accent" onClick={() => downloadJson(node.name, state.result)}>
            ↓ .JSON
          </button>
        </div>
      </div>
      <pre className="json-view">
        <code dangerouslySetInnerHTML={{ __html: html.__html }} />
        {html.capped && (
          <span className="json-capped">… preview truncated — download for the full document</span>
        )}
      </pre>
    </div>
  )
}
