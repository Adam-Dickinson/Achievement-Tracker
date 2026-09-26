export type NavigationRule = (url: string) => boolean

const rules = new WeakMap<object, NavigationRule>()

export function allowNavigation(contents: object, rule: NavigationRule): void {
  rules.set(contents, rule)
}

export function mayNavigate(contents: object, url: string): boolean {
  return rules.get(contents)?.(url) ?? false
}

export function isEaAddress(url: string): boolean {
  return isHttpsOn(url, ['ea.com'])
}

export function isSonyAddress(url: string): boolean {
  return isHttpsOn(url, ['sony.com'])
}

export function isSteamAddress(url: string): boolean {
  return isHttpsOn(url, ['steampowered.com', 'steamcommunity.com'])
}

function isHttpsOn(url: string, domains: readonly string[]): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === 'https:' &&
      domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    )
  } catch {
    return false
  }
}
