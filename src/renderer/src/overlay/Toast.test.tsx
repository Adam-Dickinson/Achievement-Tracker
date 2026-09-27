// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RARITY_LABEL, type Rarity } from '@shared/rarity'
import { Toast } from './Toast'

afterEach(cleanup)

describe('Toast', () => {
  it('shows the achievement, its game and platform, and a rarity label', () => {
    render(
      <Toast
        heading="Achievement unlocked"
        rarity="ultra_rare"
        title="Lord of Frenzied Flame"
        description="Achieve the Lord of Frenzied Flame ending"
        game="Elden Ring"
        platform="steam"
        percent={1.4}
        platinum={false}
      />,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Lord of Frenzied Flame')).toBeInTheDocument()
    expect(screen.getByText('Elden Ring')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Steam' })).toBeInTheDocument()
    expect(screen.getByText('Ultra Rare')).toBeInTheDocument()
    expect(screen.getByText('1.4%')).toBeInTheDocument()
  })

  it('shows no platform badge for a burst across several platforms', () => {
    render(
      <Toast
        heading="6 achievements unlocked"
        rarity="rare"
        title="Lord of Frenzied Flame"
        description="and 5 more"
        game="3 games"
        platform={null}
        percent={4}
        platinum={false}
      />,
    )

    expect(screen.getByText('3 games')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('labels every rarity in words, never by colour alone', () => {
    for (const rarity of Object.keys(RARITY_LABEL) as Rarity[]) {
      const { unmount } = render(
        <Toast
          heading="Achievement unlocked"
          rarity={rarity}
          title="Fleet Footed"
          description="Win a race using only the starter car"
          game="Forza Horizon 5"
          platform="xbox"
          percent={18.5}
          platinum={false}
        />,
      )
      expect(screen.getByText(RARITY_LABEL[rarity])).toBeInTheDocument()
      unmount()
    }
  })

  it('opens with "Achievement unlocked" and a rarity gem beside it', () => {
    render(
      <Toast
        heading="Achievement unlocked"
        rarity="rare"
        title="Platinum Trophy"
        description="Earn all other trophies"
        game="God of War"
        platform="playstation"
        percent={2.8}
        platinum={false}
      />,
    )

    const heading = screen.getByText('Achievement unlocked')
    expect(heading.querySelector('svg')).not.toBeNull()
  })

  it('puts the whole card in its rarity colour scope', () => {
    render(
      <Toast
        heading="Achievement unlocked"
        rarity="uncommon"
        title="Fleet Footed"
        description="Win a race using only the starter car"
        game="Forza Horizon 5"
        platform="xbox"
        percent={18.5}
        platinum={false}
      />,
    )

    expect(screen.getByRole('status')).toHaveAttribute('data-rarity', 'uncommon')
  })

  it('gives a platinum the platinum colours and a Platinum chip instead of a rarity', () => {
    render(
      <Toast
        heading="Platinum earned"
        rarity="common"
        title="Platinum"
        description="Every achievement in Portal"
        game="Portal"
        platform="steam"
        percent={null}
        platinum
      />,
    )

    const card = screen.getByRole('status')
    expect(card).toHaveAttribute('data-platinum')
    expect(card).toHaveTextContent('Platinum earned')
    expect(screen.getByText('Platinum', { selector: '[data-platinum] span' })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Common')
  })

  it('keeps an ordinary unlock out of the platinum colours', () => {
    render(
      <Toast
        heading="Achievement unlocked"
        rarity="rare"
        title="Fleet Footed"
        description={null}
        game="Forza Horizon 5"
        platform="xbox"
        percent={5}
        platinum={false}
      />,
    )

    expect(screen.getByRole('status')).not.toHaveAttribute('data-platinum')
  })

  it('shows the heading it is given, such as a burst count', () => {
    render(
      <Toast
        heading="7 achievements unlocked"
        rarity="rare"
        title="Platinum Trophy"
        description="and 6 more"
        game="God of War"
        platform="playstation"
        percent={2.8}
        platinum={false}
      />,
    )

    expect(screen.getByText('7 achievements unlocked')).toBeInTheDocument()
    expect(screen.getByText('and 6 more')).toBeInTheDocument()
  })

  it('leaves out the description line and the percentage when there are none', () => {
    render(
      <Toast
        heading="Achievement unlocked"
        rarity="common"
        title="Secret Ending"
        description={null}
        game="Hades"
        platform="steam"
        percent={null}
        platinum={false}
      />,
    )

    const card = screen.getByRole('status')
    expect(card).toHaveTextContent('Secret Ending')
    expect(card).not.toHaveTextContent('%')
    expect(card).not.toHaveTextContent('null')
    expect(screen.getByText('Common')).toBeInTheDocument()
  })
})
