import { describe, it, expect, vi } from 'vitest'

vi.mock('@janhq/core', () => ({ fs: {} }))
vi.mock('@/hooks/useServiceHub', () => ({ getServiceHub: () => ({ app: () => ({ getJanDataFolder: async () => '/data' }) }) }))
import { type UIMessage } from '@ai-sdk/react'
import { findActiveCode, normalizeCode } from '@/lib/lorebook'

const user = (text: string, id = Math.random().toString()): UIMessage =>
  ({ id, role: 'user', parts: [{ type: 'text', text }] }) as UIMessage
const bot = (text: string): UIMessage =>
  ({ id: Math.random().toString(), role: 'assistant', parts: [{ type: 'text', text }] }) as UIMessage

describe('lorebook', () => {
  it('normalizes Turkish codes', () => {
    expect(normalizeCode('Gündüz_12')).toBe('gunduz_12')
    expect(normalizeCode('Kışlık_4')).toBe('kislik_4')
    expect(normalizeCode('İç_Sahne')).toBe('ic_sahne')
  })

  it('finds the newest code in user messages', () => {
    const known = new Set(['sahne_4', 'sahne_7'])
    const msgs = [user('#sahne_4 başlayalım'), bot('tamam'), user('devam'), user('#şahne_7 sonraki bölüm')]
    expect(findActiveCode(msgs, known)).toBe('sahne_7')
  })

  it('keeps the role active over later messages without a code', () => {
    const known = new Set(['ornek_1'])
    const msgs = [user('#ornek_1'), bot('...'), user('nasılsın'), bot('...'), user('peki')]
    expect(findActiveCode(msgs, known)).toBe('ornek_1')
  })

  it('closes the role after "gerçeğe dön"', () => {
    const known = new Set(['ornek_1'])
    const msgs = [user('#ornek_1'), bot('...'), user('Gerçeğe dön')]
    expect(findActiveCode(msgs, known)).toBeUndefined()
  })

  it('ignores codes without a file and assistant messages', () => {
    const known = new Set(['ornek'])
    expect(findActiveCode([user('#etiket deneme')], known)).toBeUndefined()
    expect(findActiveCode([bot('#ornek')], known)).toBeUndefined()
  })

  it('does not treat e-mail-like text as a code', () => {
    const known = new Set(['ornek'])
    expect(findActiveCode([user('adres abc#ornek')], known)).toBeUndefined()
  })
})
