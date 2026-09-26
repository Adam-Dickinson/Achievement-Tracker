export function foldAccents(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '')
}
