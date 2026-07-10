import { useState } from 'react'
import type { FileState, TreeNode } from '../types'

interface Props {
  roots: TreeNode[]
  states: Record<string, FileState>
  selectedId: string | null
  onSelect: (id: string) => void
}

export function FileTree({ roots, states, selectedId, onSelect }: Props) {
  return (
    <ul className="tree" role="tree">
      {roots.map((node) => (
        <TreeRow key={node.id} node={node} states={states} selectedId={selectedId} onSelect={onSelect} depth={0} />
      ))}
    </ul>
  )
}

interface RowProps {
  node: TreeNode
  states: Record<string, FileState>
  selectedId: string | null
  onSelect: (id: string) => void
  depth: number
}

function TreeRow({ node, states, selectedId, onSelect, depth }: RowProps) {
  const [open, setOpen] = useState(true)

  if (node.kind === 'folder') {
    return (
      <li role="treeitem" aria-expanded={open}>
        <button
          type="button"
          className="row row-folder"
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => setOpen(!open)}
        >
          <span className="twist">{open ? '▾' : '▸'}</span>
          <span className="row-name">{node.name}/</span>
          <span className="row-meta">{countFiles(node)}</span>
        </button>
        {open && node.children && (
          <ul role="group">
            {node.children.map((child) => (
              <TreeRow
                key={child.id}
                node={child}
                states={states}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const state = states[node.id]
  const status = state?.status ?? 'skipped'
  const selected = node.id === selectedId

  return (
    <li role="treeitem" aria-selected={selected}>
      <button
        type="button"
        className={`row row-file st-${status}${selected ? ' selected' : ''}`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => onSelect(node.id)}
        title={state?.error ?? node.path}
      >
        <span className={`dot st-${status}`} aria-hidden="true" />
        <span className="row-name">{node.name}</span>
        <span className="row-meta">
          {status === 'done' && state?.result ? `${state.result.stats.blocks} blk` : statusLabel(status)}
        </span>
        {status === 'processing' && (
          <span
            className="row-progress"
            style={{ width: `${Math.round((state?.progress ?? 0) * 100)}%` }}
            aria-hidden="true"
          />
        )}
      </button>
    </li>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'processing':
      return '…'
    case 'error':
      return 'ERR'
    case 'skipped':
      return 'skip'
    default:
      return ''
  }
}

function countFiles(node: TreeNode): string {
  let n = 0
  const walk = (t: TreeNode): void => {
    if (t.kind === 'file') n++
    t.children?.forEach(walk)
  }
  walk(node)
  return `${n}`
}
