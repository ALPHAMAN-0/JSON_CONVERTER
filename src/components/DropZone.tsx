import { useCallback, useRef, useState, type DragEvent } from 'react'
import {
  collectEntries,
  filesFromEntries,
  filesFromFileList,
  type FileWithPath,
} from '../lib/treeBuilder'

interface Props {
  onFiles: (entries: FileWithPath[], readErrors?: string[]) => void
  busy: boolean
}

export function DropZone({ onFiles, busy }: Props) {
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      // Entries must be captured synchronously, before the handler yields.
      const entries = collectEntries(e.dataTransfer.items)
      if (entries.length) {
        void filesFromEntries(entries).then((scan) => onFiles(scan.files, scan.errors))
      } else if (e.dataTransfer.files.length) {
        onFiles(filesFromFileList(e.dataTransfer.files))
      }
    },
    [onFiles],
  )

  const handleInput = useCallback(
    (input: HTMLInputElement | null) => {
      if (input?.files?.length) {
        onFiles(filesFromFileList(input.files))
        input.value = ''
      }
    },
    [onFiles],
  )

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        // Ignore leave events fired when the pointer crosses into a child.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <span className="corner c-tl" aria-hidden="true" />
      <span className="corner c-tr" aria-hidden="true" />
      <span className="corner c-bl" aria-hidden="true" />
      <span className="corner c-br" aria-hidden="true" />
      {busy && <span className="scanline" aria-hidden="true" />}

      <p className="dz-glyph" aria-hidden="true">
        ⇩
      </p>
      <p className="dz-line">DROP FILES OR A FOLDER</p>
      <p className="dz-hint">PDF · PNG · JPG · WEBP · BMP · GIF · AVIF</p>
      <div className="dz-buttons">
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          SELECT FILES
        </button>
        <button type="button" className="btn" onClick={() => folderInput.current?.click()}>
          SELECT FOLDER
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,image/*"
        hidden
        onChange={(e) => handleInput(e.currentTarget)}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        onChange={(e) => handleInput(e.currentTarget)}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />
    </div>
  )
}
