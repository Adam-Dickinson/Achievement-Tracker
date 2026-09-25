export type NavigationRule = (url: string) => boolean

const rules = new WeakMap<object, NavigationRule>()

export function allowNavigation(contents: object, rule: NavigationRule): void {
  rules.set(contents, rule)
}

export function mayNavigate(contents: object, url: string): boolean {
  return rules.get(contents)?.(url) ?? false
}

export function isEaAddress(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && (hostname === 'ea.com' || hostname.endsWith('.ea.com'))
  } catch {
    return false
  }
}
