// ストリーミング配信用の WAV ヘッダを生成する。
// 合成が終わるまで全体長が分からないため、RIFF/data のサイズには
// 0xFFFFFFFF (不定長) を入れる。ffplay やブラウザはこれで逐次再生できる。
export interface WavFormat {
  sampleRate: number
  channels: number
  bitsPerSample: number
}

export const MOCA_FORMAT: WavFormat = {
  sampleRate: 48000,
  channels: 1,
  bitsPerSample: 16,
}

export function wavHeader({ sampleRate, channels, bitsPerSample }: WavFormat): Uint8Array {
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign

  const buf = new ArrayBuffer(44)
  const view = new DataView(buf)
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 0xffffffff, true) // 全体サイズ: 不定
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmt チャンクサイズ
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  ascii(36, 'data')
  view.setUint32(40, 0xffffffff, true) // データサイズ: 不定

  return new Uint8Array(buf)
}
