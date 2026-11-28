/**
 * Path containment, safe reads and small filesystem helpers. Agent Plugins
 * requires package paths to stay inside the plugin root; connectors reuse the
 * same check before handing a path to a DSH service.
 * @module @kirkchinese/harness-forge-core
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Return true when `candidate` is inside `root` (or equals it). */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Resolve a plugin-relative path and reject escapes. */
export function resolveInside(root: string, path: string): string | undefined {
  const candidate = resolve(root, path)
  return isInside(root, candidate) ? candidate : undefined
}

/** Resolve symlinks when the path exists, falling back to the lexical path. */
export function realOrLexical(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

/** Return true when a path exists and is a regular file. */
export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** Return true when a path exists and is a directory. */
export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * List immediate child directories, sorted for determinism. A symbolic link
 * to a directory counts, as harnesses follow linked skill directories.
 */
export function childDirectories(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() || (entry.isSymbolicLink() && isDirectory(`${root}/${entry.name}`)))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, 'en'))
  } catch {
    return []
  }
}

/** Read a UTF-8 file, returning undefined instead of throwing. */
export function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** Read and parse JSON, returning undefined instead of throwing. */
export function readJson(path: string): unknown {
  const text = readText(path)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * A file a harness keeps its record in, as read: absent (`{}`: a missing file records nothing, which is a complete
 * read), its object, or why it could not be read. A harness writing it may leave it malformed or cut off for a moment;
 * that must never read as "it records nothing".
 */
export interface RecordRead<T> {
  readonly value?: T
  readonly problem?: string
}

/** Errors that mean the file is not there: nothing recorded. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR'])

/** Read a harness's record file as text: absent, its text, or why it could not be read. */
export function readRecordText(path: string): RecordRead<string> {
  try {
    return { value: readFileSync(path, 'utf8') }
  } catch (error: unknown) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && ABSENT.has(code)) return {}
    return { problem: `${path} could not be read (${error instanceof Error ? error.message : String(error)})` }
  }
}

/** Read a harness's JSON object record (see {@link RecordRead}). */
export function readJsonRecord(path: string): RecordRead<Record<string, unknown>> {
  const text = readRecordText(path)
  if (text.value === undefined) return text.problem === undefined ? {} : { problem: text.problem }
  try {
    const value: unknown = JSON.parse(text.value)
    return isPlainObject(value) ? { value } : { problem: `${path} is not a JSON object` }
  } catch (error: unknown) {
    return { problem: `${path} is not valid JSON (${error instanceof Error ? error.message : String(error)})` }
  }
}

/** Parse JSON and require a plain object. */
export function readJsonObject(path: string): Record<string, unknown> | undefined {
  const value = readJson(path)
  return isPlainObject(value) ? value : undefined
}

/** A plain (non-null, non-array) object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a string field. */
export function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  return typeof field === 'string' && field.trim().length > 0 ? field : undefined
}

/** Read a string-array field, accepting a single string. */
export function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key]
  if (typeof field === 'string') return [field]
  if (!Array.isArray(field)) return []
  return field.filter((item): item is string => typeof item === 'string')
}

/** Convert a Windows or POSIX path to a stable POSIX display form. */
export function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/** The trailing path segment without an extension. */
export function stem(path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
