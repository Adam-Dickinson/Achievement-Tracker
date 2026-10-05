// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EmulatorProgram } from '@shared/launch'
import { fakeApi } from '@/test/fake-api'
import { EmulatorProgramRow } from './EmulatorProgramRow'

const FOUND: EmulatorProgram = {
  emulator: 'rpcs3',
  path: 'D:\\Emu\\rpcs3\\rpcs3.exe',
  source: 'found',
}
const CHOSEN: EmulatorProgram = {
  emulator: 'rpcs3',
  path: 'E:\\Tools\\rpcs3.exe',
  source: 'chosen',
}
const NONE: EmulatorProgram = { emulator: 'rpcs3', path: null, source: null }

afterEach(cleanup)

describe('EmulatorProgramRow', () => {
  it('shows a program found next to the data folder', async () => {
    window.api = fakeApi({ getEmulatorPrograms: vi.fn().mockResolvedValue([FOUND]) })
    render(<EmulatorProgramRow />)

    expect(await screen.findByText(FOUND.path as string)).toBeInTheDocument()
    expect(screen.getByText('Found next to the data folder')).toBeInTheDocument()
  })

  it('shows a program the user chose', async () => {
    window.api = fakeApi({ getEmulatorPrograms: vi.fn().mockResolvedValue([CHOSEN]) })
    render(<EmulatorProgramRow />)

    expect(await screen.findByText(CHOSEN.path as string)).toBeInTheDocument()
    expect(screen.getByText('Chosen by you')).toBeInTheDocument()
  })

  it('explains what to do when no program is found', async () => {
    window.api = fakeApi({ getEmulatorPrograms: vi.fn().mockResolvedValue([NONE]) })
    render(<EmulatorProgramRow />)

    expect(await screen.findByText('Not found')).toBeInTheDocument()
    expect(
      screen.getByText('Choose rpcs3.exe so games can be started from here.'),
    ).toBeInTheDocument()
  })

  it('shows the program that Choose returns', async () => {
    const choose = vi.fn().mockResolvedValue(CHOSEN)
    window.api = fakeApi({
      getEmulatorPrograms: vi.fn().mockResolvedValue([NONE]),
      chooseEmulatorProgram: choose,
    })
    render(<EmulatorProgramRow />)

    fireEvent.click(await screen.findByRole('button', { name: 'Choose…' }))

    expect(await screen.findByText(CHOSEN.path as string)).toBeInTheDocument()
    expect(choose).toHaveBeenCalledWith('rpcs3')
  })

  it('shows an error when choosing fails', async () => {
    window.api = fakeApi({
      getEmulatorPrograms: vi.fn().mockResolvedValue([NONE]),
      chooseEmulatorProgram: vi.fn().mockRejectedValue(new Error('boom')),
    })
    render(<EmulatorProgramRow />)

    fireEvent.click(await screen.findByRole('button', { name: 'Choose…' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
  })

  it('disables the button while choosing', async () => {
    let finish: (program: EmulatorProgram) => void = () => {}
    window.api = fakeApi({
      getEmulatorPrograms: vi.fn().mockResolvedValue([NONE]),
      chooseEmulatorProgram: vi.fn(
        () =>
          new Promise<EmulatorProgram>((resolve) => {
            finish = resolve
          }),
      ),
    })
    render(<EmulatorProgramRow />)

    fireEvent.click(await screen.findByRole('button', { name: 'Choose…' }))

    expect(screen.getByRole('button', { name: 'Choose…' })).toBeDisabled()
    finish(CHOSEN)
    expect(await screen.findByText(CHOSEN.path as string)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose…' })).toBeEnabled()
  })

  it('shows an error when the program cannot be read', async () => {
    window.api = fakeApi({
      getEmulatorPrograms: vi.fn().mockRejectedValue(new Error('boom')),
    })
    render(<EmulatorProgramRow />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read the emulator program.',
    )
  })
})
