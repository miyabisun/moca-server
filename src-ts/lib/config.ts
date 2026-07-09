import path from 'path'

// DB ファイルはリポジトリ直下 (.gitignore 対象)。テストは DATABASE_PATH で一時ファイルに逃がす。
export const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), 'moca.db')
