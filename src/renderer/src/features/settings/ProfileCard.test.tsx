// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_PROFILE_NAME, type Profile } from '@shared/ipc'
import { ProfileCard } from './ProfileCard'

afterEach(cleanup)

function renderCard(profile: Profile, onRename = vi.fn(() => Promise.resolve())) {
  render(<ProfileCard profile={profile} onRename={onRename} />)
  return { onRename, input: screen.getByRole('textbox', { name: 'Your name' }) }
}

describe('ProfileCard', () => {
  it('suggests the Windows name while no name is saved', () => {
    const { input } = renderCard({ name: null, windowsName: 'adamg' })

    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'adamg')
    expect(input).toHaveAttribute('maxLength', String(MAX_PROFILE_NAME))
    expect(screen.getByText(/use your Windows name \(adamg\)/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use Windows name' })).not.toBeInTheDocument()
  })

  it('shows the saved name', () => {
    const { input } = renderCard({ name: 'Adam', windowsName: 'adamg' })

    expect(input).toHaveValue('Adam')
  })

  it('saves a new name only once it has changed, then says so', async () => {
    const { input, onRename } = renderCard({ name: null, windowsName: 'adamg' })
    const save = screen.getByRole('button', { name: 'Save name' })
    expect(save).toBeDisabled()

    fireEvent.change(input, { target: { value: ' Adam ' } })
    await act(async () => fireEvent.click(save))

    expect(onRename).toHaveBeenCalledExactlyOnceWith(' Adam ')
    expect(input).toHaveValue('Adam')
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it('goes back to the Windows name', async () => {
    const { input, onRename } = renderCard({ name: 'Adam', windowsName: 'adamg' })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use Windows name' })))

    expect(onRename).toHaveBeenCalledExactlyOnceWith('')
    expect(input).toHaveValue('')
  })

  it('is disabled while saving', () => {
    const { input } = renderCard(
      { name: null, windowsName: 'adamg' },
      vi.fn(() => new Promise<void>(() => {})),
    )

    fireEvent.change(input, { target: { value: 'Adam' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('leaves out the Windows name when the system could not say it', () => {
    renderCard({ name: null, windowsName: '' })

    expect(screen.getByText(/use your Windows name\.$/)).toBeInTheDocument()
  })
})
