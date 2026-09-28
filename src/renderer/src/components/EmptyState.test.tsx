// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Plug } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(() => {
  cleanup()
})

describe('EmptyState', () => {
  it('shows the icon, heading, body and calls the action when its button is clicked', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        icon={<Plug aria-hidden="true" />}
        heading="Nothing tracked yet"
        body="Connect a platform to start tracking your achievements."
        cta="Connect a platform"
        onAction={onAction}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Nothing tracked yet' })).toBeInTheDocument()
    expect(
      screen.getByText('Connect a platform to start tracking your achievements.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Connect a platform' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('has no status live region, since this is static content, not a live announcement', () => {
    render(
      <EmptyState
        icon={<Plug aria-hidden="true" />}
        heading="Nothing tracked yet"
        body="Connect a platform."
        cta="Connect"
        onAction={() => {}}
      />,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
