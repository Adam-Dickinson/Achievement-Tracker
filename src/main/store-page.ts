const STORE_PAGES: readonly RegExp[] = [
  /^steam:\/\/nav\/games\/details\/\d+$/,
  /^https:\/\/www\.xbox\.com\/games\/store\/_\/[0-9A-Z]{12}$/,
]

export function isStorePageUrl(url: string): boolean {
  return STORE_PAGES.some((pattern) => pattern.test(url))
}

export async function openStorePage(
  url: string | null,
  open: (url: string) => Promise<void>,
): Promise<boolean> {
  if (url === null || !isStorePageUrl(url)) return false
  await open(url)
  return true
}
