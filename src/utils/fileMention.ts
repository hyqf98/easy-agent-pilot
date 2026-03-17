export const FILE_MENTION_PATTERN = /@"([^"\n]+)"|@([^\s@"]+)/g

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/

export function isGlobalMentionPath(path: string): boolean {
  return path.startsWith('/') || path.startsWith('~/') || WINDOWS_ABSOLUTE_PATH.test(path)
}

export function getMentionDisplayName(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, '')
  const parts = normalizedPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function getMentionDisplayText(literal: string, path: string): string {
  if (!isGlobalMentionPath(path)) {
    return literal
  }

  return `@${getMentionDisplayName(path)}`
}

export function getMentionTitle(path: string): string {
  if (!isGlobalMentionPath(path)) {
    return path
  }

  return getMentionDisplayName(path)
}
