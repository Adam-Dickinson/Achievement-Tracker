// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeLayout, renderScrolled } from '@/test/layout'
import { columnCount, VirtualGrid } from './VirtualGrid'

const ITEMS = Array.from({ length: 100 }, (_, i) => `Item ${i}`)

let restoreLayout: () => void

beforeEach(() => {
  restoreLayout = fakeLayout({ width: 1200, height: 800, rowHeight: 100 })
})

afterEach(() => {
  cleanup()
  restoreLayout()
})

function renderGrid(items: readonly string[] = ITEMS) {
  return renderScrolled(
    <VirtualGrid
      items={items}
      label="Things"
      minColumnWidth={240}
      gap={20}
      estimateRowHeight={100}
      getKey={(item) => item}
      renderItem={(item) => <span>{item}</span>}
    />,
  )
}

const shown = () =>
  within(screen.getByRole('list', { name: 'Things' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('VirtualGrid', () => {
  it('renders the first rows only, in order, as a labelled list', () => {
    renderGrid()

    const items = shown()
    expect(items.slice(0, 5)).toEqual(['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4'])
    expect(items.length).toBeGreaterThanOrEqual(28)
    expect(items.length).toBeLessThan(ITEMS.length)
    expect(items).not.toContain('Item 99')
  })

  it('tells each item which column it is in', () => {
    renderScrolled(
      <VirtualGrid
        items={ITEMS.slice(0, 6)}
        label="Things"
        minColumnWidth={240}
        gap={20}
        estimateRowHeight={100}
        getKey={(item) => item}
        renderItem={(item, column) => <span>{`${item} in ${column}`}</span>}
      />,
    )

    expect(shown()).toEqual([
      'Item 0 in 0',
      'Item 1 in 1',
      'Item 2 in 2',
      'Item 3 in 3',
      'Item 4 in 0',
      'Item 5 in 1',
    ])
  })

  it('lays the items out in as many columns as fit', () => {
    renderGrid()

    const firstRow = screen.getByText('Item 0').closest('[data-index]')
    expect(firstRow).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' })
    expect(within(firstRow as HTMLElement).getAllByRole('listitem')).toHaveLength(4)
  })

  it('renders the rows scrolled into view', () => {
    const { scrollParent } = renderGrid()

    act(() => {
      Object.defineProperty(scrollParent, 'scrollTop', { configurable: true, value: 2400 })
      fireEvent.scroll(scrollParent)
    })

    expect(shown()).toContain('Item 99')
    expect(shown()).not.toContain('Item 0')
  })

  it('renders every item of a short list', () => {
    renderGrid(['A', 'B', 'C'])

    expect(shown()).toEqual(['A', 'B', 'C'])
  })

  it('renders an empty list for no items', () => {
    renderGrid([])

    expect(screen.getByRole('list', { name: 'Things' })).toBeEmptyDOMElement()
  })
})

describe('columnCount', () => {
  it('fits as many columns of the minimum width as the gaps allow', () => {
    expect(columnCount(1200, 240, 20)).toBe(4)
    expect(columnCount(1020, 240, 20)).toBe(4)
    expect(columnCount(1019, 240, 20)).toBe(3)
  })

  it('never goes below one column or above the maximum', () => {
    expect(columnCount(0, 240, 20)).toBe(1)
    expect(columnCount(5000, 240, 20, 2)).toBe(2)
  })
})
