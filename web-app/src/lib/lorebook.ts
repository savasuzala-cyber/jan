/**
 * Lorebook (rol dosyaları).
 *
 * Sohbette yazılan `#kod` (ör. `#sahne_1`) ile eşleşen metni
 * `<janDataFolder>/lorebook/<kod>.txt` dosyasından okur ve sistem istemine
 * ekler. Metin sohbet geçmişine girmez; yalnızca arka planda modele gider.
 *
 * Kurallar:
 * - Sohbetteki en son kullanıcı mesajlarından geriye doğru bakılır; bulunan
 *   ilk (en yeni) geçerli kod etkin roldür.
 * - "gerçeğe dön" yazıldıysa ve ondan sonra yeni bir kod yoksa rol kapanır.
 * - Dosya adı kodun kendisidir: `sahne_1.txt` → `#sahne_1`. Türkçe harfler
 *   koda yazılırken sadeleştirilir (`#gündüz_2` → `gunduz_2`).
 * - Ayrıca klasördeki `_her_zaman.txt` (varsa) bir rol etkinken her seferinde
 *   rol metninin önüne eklenir (ör. bütün rollerde geçerli genel kurallar).
 */
import { fs } from '@janhq/core'
import { type UIMessage } from '@ai-sdk/react'
import { getServiceHub } from '@/hooks/useServiceHub'

const FOLDER_NAME = 'lorebook'
const ALWAYS_FILE = '_her_zaman'
const CODE_PATTERN = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu
const EXIT_PATTERN = /ger[çc]e[ğg]e\s+d[öo]n/i
/** Bir rol metninin sistem istemine eklenecek en büyük boyutu (karakter). */
const MAX_CHARS = 16_000

const TR_MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
  Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u',
}

/** `#Gündüz_2` → `gunduz_2` */
export function normalizeCode(raw: string): string {
  return raw
    .replace(/[çğıöşüâîûÇĞİIÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function messageText(message: UIMessage): string {
  const parts = (message as { parts?: Array<{ type?: string; text?: string }> }).parts
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('\n')
}

/**
 * Sohbetteki etkin rol kodunu bulur. `known` verilirse yalnızca klasörde
 * dosyası olan kodlar kabul edilir (normal `#etiket` kullanımları yanlışlıkla
 * rol açmasın diye).
 */
export function findActiveCode(
  messages: UIMessage[],
  known?: Set<string>
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const text = messageText(m)
    if (!text) continue
    const codes = [...text.matchAll(CODE_PATTERN)]
      .map((x) => normalizeCode(x[1]))
      .filter((c) => c.length > 0 && (!known || known.has(c)))
    if (codes.length > 0) return codes[codes.length - 1]
    if (EXIT_PATTERN.test(text)) return undefined
  }
  return undefined
}

type Cache = {
  folder?: string
  codes: Set<string>
  texts: Map<string, string>
  loadedAt: number
}

const cache: Cache = { codes: new Set(), texts: new Map(), loadedAt: 0 }
/** Klasör listesini en çok bu sıklıkta yeniden okur (ms). */
const REFRESH_MS = 10_000

async function folderPath(): Promise<string | undefined> {
  if (cache.folder) return cache.folder
  try {
    const base = await getServiceHub().app().getJanDataFolder()
    if (!base) return undefined
    cache.folder = `${base}/${FOLDER_NAME}`
    return cache.folder
  } catch {
    return undefined
  }
}

async function refreshIndex(): Promise<void> {
  const now = Date.now()
  if (now - cache.loadedAt < REFRESH_MS) return
  cache.loadedAt = now
  const dir = await folderPath()
  if (!dir) return
  try {
    if (!(await fs.existsSync(dir))) {
      cache.codes = new Set()
      return
    }
    const entries: string[] = await fs.readdirSync(dir)
    const codes = new Set<string>()
    for (const entry of Array.isArray(entries) ? entries : []) {
      const name = String(entry).split(/[\\/]/).pop() ?? ''
      if (!name.toLowerCase().endsWith('.txt')) continue
      const code = normalizeCode(name.slice(0, -4))
      if (code && code !== normalizeCode(ALWAYS_FILE)) codes.add(code)
    }
    cache.codes = codes
    cache.texts.clear()
  } catch {
    cache.codes = new Set()
  }
}

async function readText(code: string): Promise<string> {
  if (cache.texts.has(code)) return cache.texts.get(code) as string
  const dir = await folderPath()
  if (!dir) return ''
  try {
    const path = `${dir}/${code}.txt`
    if (!(await fs.existsSync(path))) return ''
    const raw = String(await fs.readFileSync(path)).replace(/^\uFEFF/, '').trim()
    const text = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw
    cache.texts.set(code, text)
    return text
  } catch {
    return ''
  }
}

/**
 * Mesaj gönderilmeden önce çağrılır: etkin rolü bulur ve sistem istemine
 * eklenecek metni döndürür (`''` = rol yok). Hata olursa sessizce boş döner;
 * sohbet hiçbir zaman bu yüzden durmaz.
 */
export async function prepareLorebook(messages: UIMessage[]): Promise<string> {
  try {
    await refreshIndex()
    if (cache.codes.size === 0) return ''
    const code = findActiveCode(messages, cache.codes)
    if (!code) return ''
    const roleText = await readText(code)
    if (!roleText) return ''
    const always = await readText(normalizeCode(ALWAYS_FILE))
    return [`# Etkin rol dosyası: #${code}`, always, roleText]
      .filter((s) => s && s.trim().length > 0)
      .join('\n\n')
  } catch {
    return ''
  }
}
