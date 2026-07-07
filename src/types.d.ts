import 'hono'

// Shared Hono context variables. analyzeCmd is injected by createApp so the
// import (acting) route can reach the (test-injectable) analyze command.
declare module 'hono' {
  interface ContextVariableMap {
    analyzeCmd: string[]
  }
}
