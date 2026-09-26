import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ScrollParentContext } from '@/components/scroll-parent'

interface FakeLayout {
  width?: number
  height?: number
  rowHeight?: number
}

export function fakeLayout({ width = 1200, height = 800, rowHeight = 100 }: FakeLayout = {}) {
  const proto = HTMLElement.prototype
  const offsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')
  const offsetHeight = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')
  const getBoundingClientRect = Element.prototype.getBoundingClientRect

  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => width })
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-index') ? rowHeight : height
    },
  })
  Element.prototype.getBoundingClientRect = function (this: Element) {
    let top = 0
    for (let parent = this.parentElement; parent; parent = parent.parentElement) {
      top -= parent.scrollTop
    }
    return new DOMRect(0, top, width, rowHeight)
  }

  return () => {
    if (offsetWidth) Object.defineProperty(proto, 'offsetWidth', offsetWidth)
    if (offsetHeight) Object.defineProperty(proto, 'offsetHeight', offsetHeight)
    Element.prototype.getBoundingClientRect = getBoundingClientRect
  }
}

export function renderScrolled(ui: ReactNode): RenderResult & { scrollParent: HTMLElement } {
  const scrollParent = document.body.appendChild(document.createElement('div'))
  const result = render(<ScrollParentContext value={scrollParent}>{ui}</ScrollParentContext>, {
    container: scrollParent,
  })
  return { ...result, scrollParent }
}
