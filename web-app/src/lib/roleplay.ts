/**
 * Roleplay (rol oyunu) mode.
 *
 * A thread can carry a character in `thread.metadata.roleplay`. When it is
 * enabled, the character is turned into a system prompt and combined with the
 * thread assistant's own instructions before each request.
 *
 * Character cards exported from SillyTavern (V1 flat JSON, V2/V3 with a `data`
 * wrapper, or a PNG with the card in a `chara` / `ccv3` tEXt chunk) can be
 * imported directly.
 */

export interface RoleplayCharacter {
  name: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  userName: string
}

export interface RoleplayState {
  enabled: boolean
  character: RoleplayCharacter
}

export const ROLEPLAY_METADATA_KEY = 'roleplay'

export const emptyCharacter = (): RoleplayCharacter => ({
  name: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  exampleDialogue: '',
  userName: '',
})

export function getRoleplayState(
  metadata?: Record<string, unknown>
): RoleplayState | undefined {
  const raw = metadata?.[ROLEPLAY_METADATA_KEY] as
    | Partial<RoleplayState>
    | undefined
  if (!raw || typeof raw !== 'object' || !raw.character) return undefined
  return {
    enabled: !!raw.enabled,
    character: { ...emptyCharacter(), ...raw.character },
  }
}

/** Replace SillyTavern-style {{char}} / {{user}} macros. */
export function applyMacros(text: string, char: string, user: string): string {
  return text
    .replace(/\{\{\s*char\s*\}\}/gi, char)
    .replace(/\{\{\s*user\s*\}\}/gi, user)
    .replace(/<BOT>/g, char)
    .replace(/<USER>/g, user)
}

export function buildRoleplayPrompt(c: RoleplayCharacter): string | undefined {
  const char = c.name.trim()
  if (!char) return undefined
  const user = c.userName.trim() || 'Kullanıcı'
  const m = (s: string) => applyMacros(s.trim(), char, user)

  const parts: string[] = [
    `Bu bir rol oyunu. Sen ${char} karakterisin ve konuşmanın tamamında bu karakterde kalırsın. ` +
      `Karşındaki kişi ${user}. Asla yapay zekâ olduğunu söyleme, karakterden çıkma; ` +
      `${user} adına konuşma, onun ne yaptığını ya da ne söylediğini sen yazma.`,
  ]
  if (c.description.trim()) parts.push(`## ${char} kimdir\n${m(c.description)}`)
  if (c.personality.trim()) parts.push(`## Kişilik\n${m(c.personality)}`)
  if (c.scenario.trim()) parts.push(`## Senaryo\n${m(c.scenario)}`)
  if (c.exampleDialogue.trim())
    parts.push(
      `## Konuşma tarzı örnekleri (sadece üslup için; aynen tekrarlama)\n${m(c.exampleDialogue)}`
    )
  if (c.firstMessage.trim())
    parts.push(`## Açılış\nKonuşma şu açılışla başladı:\n${m(c.firstMessage)}`)
  return parts.join('\n\n')
}

/** Combine the assistant's instructions with the roleplay prompt. */
export function combineSystemMessage(
  base: string | undefined,
  metadata?: Record<string, unknown>
): string | undefined {
  const state = getRoleplayState(metadata)
  const rp = state?.enabled ? buildRoleplayPrompt(state.character) : undefined
  if (!rp) return base
  return base ? `${base}\n\n${rp}` : rp
}

// ---------------------------------------------------------------------------
// Character card import
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function parseCharacterCardJson(input: unknown): RoleplayCharacter {
  if (!input || typeof input !== 'object') {
    throw new Error('Geçersiz karakter kartı')
  }
  const obj = input as Record<string, unknown>
  // V2 / V3 cards keep the fields under `data`.
  const d =
    obj.data && typeof obj.data === 'object'
      ? (obj.data as Record<string, unknown>)
      : obj
  const name = str(d.name) || str(obj.char_name)
  if (!name) throw new Error('Kartta karakter adı yok')
  return {
    name,
    description: str(d.description) || str(obj.char_persona),
    personality: str(d.personality),
    scenario: str(d.scenario) || str(obj.world_scenario),
    firstMessage: str(d.first_mes) || str(obj.char_greeting),
    exampleDialogue: str(d.mes_example) || str(obj.example_dialogue),
    userName: '',
  }
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.trim())
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** Read the `chara` (V2) or `ccv3` (V3) tEXt chunk from a PNG card. */
export function extractCardFromPng(buf: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buf)
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error('PNG değil')
  const view = new DataView(buf)
  const latin1 = new TextDecoder('latin1')
  const found: Record<string, string> = {}
  let off = 8
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off)
    const type = latin1.decode(bytes.subarray(off + 4, off + 8))
    const dataStart = off + 8
    if (type === 'tEXt') {
      const chunk = bytes.subarray(dataStart, dataStart + len)
      const sep = chunk.indexOf(0)
      if (sep > 0) {
        const key = latin1.decode(chunk.subarray(0, sep)).toLowerCase()
        found[key] = latin1.decode(chunk.subarray(sep + 1))
      }
    }
    if (type === 'IEND') break
    off = dataStart + len + 4 // + CRC
  }
  const b64 = found['ccv3'] ?? found['chara']
  if (!b64) throw new Error('PNG içinde karakter kartı bulunamadı')
  return JSON.parse(decodeBase64Utf8(b64))
}

export async function parseCharacterFile(
  file: File
): Promise<RoleplayCharacter> {
  const isPng =
    file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  if (isPng) {
    return parseCharacterCardJson(extractCardFromPng(await file.arrayBuffer()))
  }
  return parseCharacterCardJson(JSON.parse(await file.text()))
}
