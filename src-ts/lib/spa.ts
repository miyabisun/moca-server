import fs from 'fs'
import path from 'path'

const defaultIndexPath = path.join(process.cwd(), 'client/build/index.html')
const isProd = process.env.NODE_ENV === 'production'

let indexHtml: string | null = null
let indexMtime = 0

// 管理画面 SPA の index.html を返す。ビルド前は null (app.ts が 404 を返す)。
// dev では mtime が変わると再読込する。
export function getIndexHtml(indexPath: string = defaultIndexPath): string | null {
  if (isProd && indexHtml) return indexHtml

  try {
    const stat = fs.statSync(indexPath)
    const mtime = stat.mtimeMs
    if (!indexHtml || mtime !== indexMtime) {
      indexHtml = fs.readFileSync(indexPath, 'utf-8')
      indexMtime = mtime
    }
  } catch {
    return null
  }
  return indexHtml
}

// Test-only: clears the module-level cache so tests can exercise the read/reload path.
export function __resetIndexHtmlCache(): void {
  indexHtml = null
  indexMtime = 0
}
