import { foldAccents } from '@shared/text'

export function searchText(text: string): string {
  return foldAccents(text).toLowerCase()
}

export function searchWords(query: string): string[] {
  return searchText(query).split(/\s+/).filter(Boolean)
}

export function matchesSearch(text: string, words: readonly string[]): boolean {
  const haystack = searchText(text)
  return words.every((word) => haystack.includes(word))
}
