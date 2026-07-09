import 'hono'
import type { Analyzer } from './analyze.js'

// createApp が context に注入する共有変数。
// import (acting) ルートが analyzer (テスト注入可) にアクセスするための橋渡し。
declare module 'hono' {
  interface ContextVariableMap {
    analyzer: Analyzer
  }
}
