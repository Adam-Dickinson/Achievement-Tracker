import { createHash } from 'node:crypto'
import { win32 } from 'node:path'
import { ProviderError } from '@shared/errors'
import { childText, parseXml, type XmlElement } from '../providers/xml'

export interface XboxPackage {
  readonly titleId: string
  readonly title: string
  readonly appUserModelId: string
}

const GAMING_ROOT_MAGIC = 'RGBX'
const GAMING_ROOT_HEADER_BYTES = 8
const PUBLISHER_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const PACKAGE_NAME = /^[A-Za-z0-9.-]{3,50}$/
const APPLICATION_ID = /^[A-Za-z][A-Za-z0-9.]{0,63}$/
const TITLE_ID = /^[0-9A-Fa-f]{1,8}$/
const RESOURCE_REFERENCE = 'ms-resource:'

export function parseGamingRoot(bytes: Uint8Array): string[] {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    buffer.length < GAMING_ROOT_HEADER_BYTES ||
    buffer.toString('latin1', 0, GAMING_ROOT_MAGIC.length) !== GAMING_ROOT_MAGIC
  ) {
    throw new ProviderError('parse', 'Xbox: .GamingRoot does not start with RGBX')
  }
  const end = buffer.length - ((buffer.length - GAMING_ROOT_HEADER_BYTES) % 2)
  return buffer
    .toString('utf16le', GAMING_ROOT_HEADER_BYTES, end)
    .split('\0')
    .map((folder) => folder.trim())
    .filter((folder) => folder !== '' && isPlainRelative(folder))
}

function isPlainRelative(folder: string): boolean {
  return (
    !win32.isAbsolute(folder) && !folder.includes(':') && !/(^|[\\/])\.\.([\\/]|$)/.test(folder)
  )
}

export function publisherId(publisher: string): string {
  const hash = createHash('sha256').update(Buffer.from(publisher, 'utf16le')).digest()
  let bits = hash.readBigUInt64BE(0) << 1n
  let id = ''
  for (let group = 0; group < 13; group++) {
    id = PUBLISHER_ID_ALPHABET.charAt(Number(bits & 31n)) + id
    bits >>= 5n
  }
  return id
}

export function readXboxPackage(
  manifestXml: string,
  configXml: string,
  folderName: string,
): XboxPackage | null {
  const manifest = parseXml(manifestXml, 'Xbox appxmanifest.xml')
  const config = parseXml(configXml, 'Xbox MicrosoftGame.config')
  if (manifest.name !== 'Package' || config.name !== 'Game') {
    throw new ProviderError('parse', 'Xbox: not a game package')
  }

  const applicationId = firstApplicationId(manifest)
  const titleId = childText(config, 'TitleId')?.trim()
  if (applicationId === null || !titleId) return null
  if (!APPLICATION_ID.test(applicationId) || !TITLE_ID.test(titleId)) {
    throw new ProviderError('parse', 'Xbox: the application or title id is malformed')
  }

  const identity = manifest.children.find((child) => child.name === 'Identity')
  const name = identity?.attributes['Name']
  const publisher = identity?.attributes['Publisher']
  if (!name || !PACKAGE_NAME.test(name) || !publisher) {
    throw new ProviderError('parse', 'Xbox: the package identity is missing or malformed')
  }

  return {
    titleId: Number.parseInt(titleId, 16).toString(),
    title: displayName(manifest, config) ?? folderName,
    appUserModelId: `${name}_${publisherId(publisher)}!${applicationId}`,
  }
}

function firstApplicationId(manifest: XmlElement): string | null {
  const applications = manifest.children.find((child) => child.name === 'Applications')
  const first = applications?.children.find((child) => child.name === 'Application')
  return first?.attributes['Id'] ?? null
}

function displayName(manifest: XmlElement, config: XmlElement): string | null {
  const visuals = config.children.find((child) => child.name === 'ShellVisuals')
  const properties = manifest.children.find((child) => child.name === 'Properties')
  const candidates = [
    visuals?.attributes['DefaultDisplayName'],
    properties ? childText(properties, 'DisplayName') : null,
  ]
  for (const candidate of candidates) {
    const name = candidate?.trim()
    if (name && !name.startsWith(RESOURCE_REFERENCE)) return name
  }
  return null
}
