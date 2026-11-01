import { describe, it, expect } from 'vitest'
import {
  applyMacros,
  buildRoleplayPrompt,
  combineSystemMessage,
  emptyCharacter,
  extractCardFromPng,
  parseCharacterCardJson,
} from '../roleplay'

const card = { ...emptyCharacter(), name: 'Şule', userName: 'Savaş' }

describe('roleplay', () => {
  it('replaces macros', () => {
    expect(applyMacros('{{char}} ve {{ user }}', 'Şule', 'Savaş')).toBe(
      'Şule ve Savaş'
    )
  })

  it('builds no prompt without a name', () => {
    expect(buildRoleplayPrompt(emptyCharacter())).toBeUndefined()
  })

  it('builds a prompt with filled sections only', () => {
    const p = buildRoleplayPrompt({ ...card, scenario: '{{user}} kapıyı çalar' })!
    expect(p).toContain('Sen Şule karakterisin')
    expect(p).toContain('Savaş kapıyı çalar')
    expect(p).not.toContain('## Kişilik')
  })

  it('combines with base only when enabled', () => {
    const meta = { roleplay: { enabled: true, character: card } }
    expect(combineSystemMessage('BASE', meta)).toMatch(/^BASE\n\nBu bir rol/)
    expect(
      combineSystemMessage('BASE', { roleplay: { enabled: false, character: card } })
    ).toBe('BASE')
    expect(combineSystemMessage(undefined, {})).toBeUndefined()
  })

  it('parses V1 and V2 cards', () => {
    expect(parseCharacterCardJson({ name: 'A', first_mes: 'Selam' }).firstMessage).toBe('Selam')
    const v2 = parseCharacterCardJson({
      spec: 'chara_card_v2',
      data: { name: 'B', scenario: 'S', mes_example: 'E' },
    })
    expect(v2).toMatchObject({ name: 'B', scenario: 'S', exampleDialogue: 'E' })
    expect(() => parseCharacterCardJson({})).toThrow()
  })

  it('reads a card from a PNG tEXt chunk', () => {
    const json = JSON.stringify({ data: { name: 'Şule' } })
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    const text = new TextEncoder().encode('chara\0' + b64)
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length)
      new DataView(out.buffer).setUint32(0, data.length)
      out.set(new TextEncoder().encode(type), 4)
      out.set(data, 8)
      return out
    }
    const parts = [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('tEXt', text),
      chunk('IEND', new Uint8Array()),
    ]
    const total = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
      total.set(p, o)
      o += p.length
    }
    const parsed = parseCharacterCardJson(extractCardFromPng(total.buffer))
    expect(parsed.name).toBe('Şule')
  })
})
