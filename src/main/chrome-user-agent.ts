export function chromeUserAgent(userAgent: string): string {
  return userAgent.replace(/ Electron\/\S+/, '').replace(/ [\w-]+\/[\d.]+(?= Chrome)/, '')
}
