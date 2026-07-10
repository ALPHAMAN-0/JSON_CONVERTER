import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { DropZone } from './components/DropZone'
import { FileTree } from './components/FileTree'
import { Inspector } from './components/Inspector'
import { runConversions } from './lib/convertController'
import { buildCombinedExport, downloadJson } from './lib/exporter'
import { buildTree, collectFileNodes, type FileWithPath } from './lib/treeBuilder'
import type { FileState, TreeNode } from './types'

interface State {
  roots: TreeNode[]
  fileStates: Record<string, FileState>
  selectedId: string | null
}

type Action =
  | { type: 'add'; roots: TreeNode[]; states: Record<string, FileState>; autoSelect: string | null }
  | { type: 'patch'; id: string; patch: Partial<FileState> }
  | { type: 'select'; id: string }
  | { type: 'clear' }

const initialState: State = { roots: [], fileStates: {}, selectedId: null }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add':
      return {
        roots: [...state.roots, ...action.roots],
        fileStates: { ...state.fileStates, ...action.states },
        selectedId: state.selectedId ?? action.autoSelect,
      }
    case 'patch': {
      const prev = state.fileStates[action.id]
      if (!prev) return state
      return {
        ...state,
        fileStates: { ...state.fileStates, [action.id]: { ...prev, ...action.patch } },
      }
    }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'clear':
      return initialState
    default:
      return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [notice, setNotice] = useState<string | null>(null)
  const batchRef = useRef(0)
  // Bumped by CLEAR so in-flight conversions from before the clear go inert.
  const runRef = useRef(0)
  // Reducer state lags inside async callbacks; keep a live mirror for exports.
  const liveRef = useRef(state)
  liveRef.current = state

  // A stray drop outside the dropzone must not navigate away from the app.
  useEffect(() => {
    const prevent = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const addFiles = useCallback((entries: FileWithPath[], readErrors?: string[]) => {
    if (!entries.length) {
      setNotice(
        readErrors?.length
          ? `nothing added — ${readErrors.length} item(s) could not be read`
          : 'nothing added — no readable files in that drop',
      )
      return
    }
    setNotice(readErrors?.length ? `${readErrors.length} item(s) could not be read and were skipped` : null)
    const roots = buildTree(entries, ++batchRef.current)
    const fileNodes = collectFileNodes(roots)
    const states: Record<string, FileState> = {}
    for (const node of fileNodes) {
      states[node.id] = {
        status: node.fileKind === 'unsupported' ? 'skipped' : 'queued',
      }
    }
    const firstConvertible = fileNodes.find((n) => n.fileKind !== 'unsupported')
    dispatch({ type: 'add', roots, states, autoSelect: firstConvertible?.id ?? null })
    const run = runRef.current
    void runConversions(
      fileNodes,
      (id, patch) => {
        if (runRef.current === run) dispatch({ type: 'patch', id, patch })
      },
      () => runRef.current !== run,
    )
  }, [])

  const clearAll = useCallback(() => {
    runRef.current++
    setNotice(null)
    dispatch({ type: 'clear' })
  }, [])

  const totals = useMemo(() => {
    const values = Object.values(state.fileStates)
    const done = values.filter((v) => v.status === 'done')
    return {
      files: values.length,
      done: done.length,
      errors: values.filter((v) => v.status === 'error').length,
      processing: values.filter((v) => v.status === 'processing' || v.status === 'queued').length,
      blocks: done.reduce((n, v) => n + (v.result?.stats.blocks ?? 0), 0),
      words: done.reduce((n, v) => n + (v.result?.stats.words ?? 0), 0),
    }
  }, [state.fileStates])

  const selectedNode = useMemo(() => {
    if (!state.selectedId) return null
    const find = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === state.selectedId) return node
        const hit = node.children ? find(node.children) : null
        if (hit) return hit
      }
      return null
    }
    return find(state.roots)
  }, [state.roots, state.selectedId])

  const downloadAll = useCallback(() => {
    const live = liveRef.current
    downloadJson('workspace', buildCombinedExport(live.roots, live.fileStates))
  }, [])

  const busy = totals.processing > 0

  return (
    <div className="app">
      <div className="frame-line" aria-hidden="true" />
      <header className="masthead reveal">
        <div className="brand">
          <span className="brand-mark">{'{ }'}</span>
          <div>
            <h1 className="brand-name">
              JSON<span className="brand-thin">CONVERTER</span>
            </h1>
            <p className="brand-sub">PDF · IMAGE → STRUCTURED JSON // 100% IN-BROWSER</p>
          </div>
        </div>
        <div className="counters" role="status" aria-label="conversion counters">
          <Counter label="FILES" value={totals.files} />
          <Counter label="DONE" value={totals.done} accent={totals.done > 0} />
          <Counter label="BLOCKS" value={totals.blocks} />
          <Counter label="WORDS" value={totals.words} />
          {totals.errors > 0 && <Counter label="ERRORS" value={totals.errors} danger />}
        </div>
      </header>

      <main className="workbench">
        <section className="panel panel-input reveal reveal-2" aria-label="input">
          <div className="panel-head">
            <span className="panel-index">01</span>
            <span className="panel-title">INPUT</span>
            <span className="panel-status">
              {busy ? (
                <span className="status-busy">CONVERTING</span>
              ) : (
                <span className="status-ready">
                  READY<span className="caret">_</span>
                </span>
              )}
            </span>
          </div>
          <DropZone onFiles={addFiles} busy={busy} />
          {notice && <p className="notice">⚠ {notice}</p>}
          <div className="tree-wrap">
            {state.roots.length === 0 ? (
              <p className="tree-empty">// drop a PDF, an image, or an entire folder</p>
            ) : (
              <FileTree
                roots={state.roots}
                states={state.fileStates}
                selectedId={state.selectedId}
                onSelect={(id) => dispatch({ type: 'select', id })}
              />
            )}
          </div>
          {state.roots.length > 0 && (
            <div className="input-actions">
              <button
                type="button"
                className="btn"
                onClick={downloadAll}
                disabled={busy}
                title={busy ? 'available when all conversions finish' : 'download the full tree as one JSON file'}
              >
                ↓ WORKSPACE.JSON
              </button>
              <button type="button" className="btn btn-ghost" onClick={clearAll}>
                CLEAR
              </button>
            </div>
          )}
        </section>

        <section className="panel panel-output reveal reveal-3" aria-label="output">
          <div className="panel-head">
            <span className="panel-index">02</span>
            <span className="panel-title">OUTPUT</span>
            {selectedNode && <span className="panel-status panel-file">{selectedNode.path}</span>}
          </div>
          <Inspector
            key={selectedNode?.id ?? 'empty'}
            node={selectedNode}
            state={selectedNode ? state.fileStates[selectedNode.id] : undefined}
          />
        </section>
      </main>

      <footer className="colophon reveal reveal-3">
        <span>FILES NEVER LEAVE YOUR BROWSER — PARSING &amp; OCR RUN LOCALLY</span>
        <a href="https://github.com/ALPHAMAN-0/JSON_CONVERTER" target="_blank" rel="noreferrer">
          SOURCE ↗
        </a>
      </footer>
    </div>
  )
}

function Counter({
  label,
  value,
  accent,
  danger,
}: {
  label: string
  value: number
  accent?: boolean
  danger?: boolean
}) {
  return (
    <div className={`counter${accent ? ' counter-accent' : ''}${danger ? ' counter-danger' : ''}`}>
      <span className="counter-value">{value.toLocaleString()}</span>
      <span className="counter-label">{label}</span>
    </div>
  )
}
