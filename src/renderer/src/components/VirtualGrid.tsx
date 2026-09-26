import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState, type Key, type ReactNode, type RefObject } from 'react'
import { useScrollParent } from './scroll-parent'

interface VirtualGridProps<T> {
  items: readonly T[]
  label: string
  minColumnWidth: number
  maxColumns?: number
  gap: number
  estimateRowHeight: number
  getKey: (item: T) => Key
  renderItem: (item: T) => ReactNode
}

export function VirtualGrid<T>({
  items,
  label,
  minColumnWidth,
  maxColumns = Infinity,
  gap,
  estimateRowHeight,
  getKey,
  renderItem,
}: VirtualGridProps<T>) {
  const scrollParent = useScrollParent()
  const listRef = useRef<HTMLDivElement>(null)
  const { width, offset } = useListBox(listRef, scrollParent)
  const columns = columnCount(width, minColumnWidth, gap, maxColumns)
  const rows = chunk(items, columns)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => estimateRowHeight,
    gap,
    overscan: 2,
    scrollMargin: offset,
  })

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 grid w-full"
          style={{
            gap,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            transform: `translateY(${row.start - offset}px)`,
          }}
        >
          {rows[row.index]?.map((item) => (
            <div key={getKey(item)} role="listitem" className="flex">
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function columnCount(
  width: number,
  minColumnWidth: number,
  gap: number,
  maxColumns = Infinity,
): number {
  const fit = Math.floor((width + gap) / (minColumnWidth + gap))
  return Math.max(1, Math.min(maxColumns, fit))
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

function useListBox(list: RefObject<HTMLElement | null>, scrollParent: HTMLElement | null) {
  const [box, setBox] = useState({ width: 0, offset: 0 })

  useLayoutEffect(() => {
    const element = list.current
    if (!element || !scrollParent) return

    const measure = () => {
      const width = element.offsetWidth
      const offset =
        element.getBoundingClientRect().top -
        scrollParent.getBoundingClientRect().top +
        scrollParent.scrollTop
      setBox((box) => (box.width === width && box.offset === offset ? box : { width, offset }))
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    for (let node: HTMLElement | null = element; node && node !== scrollParent;) {
      observer.observe(node)
      node = node.parentElement
    }
    return () => observer.disconnect()
  }, [list, scrollParent])

  return box
}
