import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversionResult, FileState, TreeNode } from '../types'

// The real converters pull in pdf.js and Tesseract, which need a browser.
// Replace them so only the queueing logic in convertController is under test.
vi.mock('./pdfConverter', () => ({ convertPdf: vi.fn() }))
vi.mock('./imageConverter', () => ({ convertImage: vi.fn() }))

import { runConversions } from './convertController'
import { convertImage } from './imageConverter'
import { convertPdf } from './pdfConverter'
import { buildResult } from './resultBuilder'

const pdfMock = vi.mocked(convertPdf)
const imageMock = vi.mocked(convertImage)

const fileNode = (name: string, fileKind: TreeNode['fileKind']): TreeNode => ({
  id: `1:${name}`,
  name,
  path: name,
  kind: 'file',
  fileKind,
  file: new File(['x'], name),
})

const resultFor = (name: string): ConversionResult => buildResult(new File(['x'], name), 'pdf', [])

type Patch = [id: string, patch: Partial<FileState>]

function recorder(): { patches: Patch[]; patch: (id: string, patch: Partial<FileState>) => void } {
  const patches: Patch[] = []
  return { patches, patch: (id, p) => patches.push([id, p]) }
}

beforeEach(() => {
  pdfMock.mockReset()
  imageMock.mockReset()
})

describe('runConversions', () => {
  it('routes each file to its converter and skips folders and unsupported files', async () => {
    pdfMock.mockImplementation(async (file) => resultFor(file.name))
    imageMock.mockImplementation(async (file) => resultFor(file.name))
    const folder: TreeNode = { id: '1:docs/', name: 'docs', path: 'docs', kind: 'folder', children: [] }
    const { patches, patch } = recorder()

    await runConversions([folder, fileNode('a.pdf', 'pdf'), fileNode('b.png', 'image'), fileNode('c.txt', 'unsupported')], patch)

    expect(pdfMock.mock.calls.map(([file]) => file.name)).toEqual(['a.pdf'])
    expect(imageMock.mock.calls.map(([file]) => file.name)).toEqual(['b.png'])
    expect(patches.filter(([id]) => id === '1:c.txt' || id === '1:docs/')).toEqual([])
    expect(patches.filter(([id]) => id === '1:a.pdf').map(([, p]) => p.status)).toEqual(['processing', 'done'])
    const done = patches.find(([id, p]) => id === '1:b.png' && p.status === 'done')
    expect(done?.[1]).toMatchObject({ progress: 1, result: { source: { fileName: 'b.png' } } })
  })

  it('forwards converter progress as state patches', async () => {
    pdfMock.mockImplementation(async (file, onProgress) => {
      onProgress(0.5, 'page 1/2')
      return resultFor(file.name)
    })
    const { patches, patch } = recorder()

    await runConversions([fileNode('a.pdf', 'pdf')], patch)

    expect(patches).toContainEqual(['1:a.pdf', { progress: 0.5, progressLabel: 'page 1/2' }])
  })

  it('records a failure on that file and keeps converting the rest', async () => {
    pdfMock.mockImplementation(async (file) => {
      if (file.name === 'bad.pdf') throw new Error('Not a valid PDF file.')
      if (file.name === 'odd.pdf') throw 'plain string failure'
      return resultFor(file.name)
    })
    const { patches, patch } = recorder()

    await runConversions([fileNode('bad.pdf', 'pdf'), fileNode('odd.pdf', 'pdf'), fileNode('good.pdf', 'pdf')], patch)

    const last = (id: string): Partial<FileState> | undefined => patches.filter(([i]) => i === id).pop()?.[1]
    expect(last('1:bad.pdf')).toMatchObject({ status: 'error', error: 'Not a valid PDF file.' })
    expect(last('1:odd.pdf')).toMatchObject({ status: 'error', error: 'plain string failure' })
    expect(last('1:good.pdf')).toMatchObject({ status: 'done' })
  })

  it('never runs more than two conversions at once', async () => {
    let inFlight = 0
    let peak = 0
    pdfMock.mockImplementation(async (file) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return resultFor(file.name)
    })
    const nodes = ['1.pdf', '2.pdf', '3.pdf', '4.pdf', '5.pdf'].map((n) => fileNode(n, 'pdf'))

    await runConversions(nodes, () => undefined)

    expect(pdfMock).toHaveBeenCalledTimes(5)
    expect(peak).toBe(2)
  })

  it('starts nothing when already cancelled', async () => {
    const { patches, patch } = recorder()

    await runConversions([fileNode('a.pdf', 'pdf')], patch, () => true)

    expect(pdfMock).not.toHaveBeenCalled()
    expect(patches).toEqual([])
  })

  it('stops picking up queued files once cancelled', async () => {
    let cancelled = false
    pdfMock.mockImplementation(async (file) => {
      await Promise.resolve()
      cancelled = true
      return resultFor(file.name)
    })
    const nodes = ['1.pdf', '2.pdf', '3.pdf', '4.pdf'].map((n) => fileNode(n, 'pdf'))

    await runConversions(nodes, () => undefined, () => cancelled)

    // Both workers had already taken a file before the first one finished.
    expect(pdfMock.mock.calls.map(([file]) => file.name)).toEqual(['1.pdf', '2.pdf'])
  })
})
