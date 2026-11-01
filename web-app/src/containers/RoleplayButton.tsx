import { useEffect, useRef, useState } from 'react'
import { IconMasksTheater, IconUpload } from '@tabler/icons-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useThreads } from '@/hooks/useThreads'
import {
  ROLEPLAY_METADATA_KEY,
  emptyCharacter,
  getRoleplayState,
  parseCharacterFile,
  type RoleplayCharacter,
} from '@/lib/roleplay'

interface RoleplayButtonProps {
  thread: Thread
}

const FIELDS: {
  key: keyof RoleplayCharacter
  label: string
  placeholder: string
  multiline?: boolean
}[] = [
  { key: 'name', label: 'Karakter adı', placeholder: 'Şule' },
  { key: 'userName', label: 'Senin adın', placeholder: 'Savaş' },
  {
    key: 'description',
    label: 'Karakter tanımı',
    placeholder: 'Kim, nereli, neye benzer, geçmişi…',
    multiline: true,
  },
  {
    key: 'personality',
    label: 'Kişilik',
    placeholder: 'Hazırcevap, sokak ağzıyla konuşur…',
    multiline: true,
  },
  {
    key: 'scenario',
    label: 'Senaryo',
    placeholder: 'Nerede, ne oluyor? {{char}} ve {{user}} kullanılabilir',
    multiline: true,
  },
  {
    key: 'firstMessage',
    label: 'Açılış mesajı',
    placeholder: 'Karakterin ilk cümlesi',
    multiline: true,
  },
  {
    key: 'exampleDialogue',
    label: 'Örnek diyalog',
    placeholder: '{{user}}: Naber?\n{{char}}: …',
    multiline: true,
  },
]

export function RoleplayButton({ thread }: RoleplayButtonProps) {
  const updateThread = useThreads((s) => s.updateThread)
  const current = getRoleplayState(thread.metadata)
  const active = !!current?.enabled && !!current.character.name.trim()

  const [open, setOpen] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [char, setChar] = useState<RoleplayCharacter>(emptyCharacter())
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setChar(current?.character ?? emptyCharacter())
    setEnabled(current ? current.enabled : true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = (key: keyof RoleplayCharacter, value: string) =>
    setChar((c) => ({ ...c, [key]: value }))

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const card = await parseCharacterFile(file)
      setChar((c) => ({ ...card, userName: c.userName }))
      toast.success(`Karakter yüklendi: ${card.name}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Karakter kartı okunamadı'
      )
    }
  }

  const save = (nextEnabled: boolean) => {
    updateThread(thread.id, {
      metadata: {
        ...(thread.metadata ?? {}),
        [ROLEPLAY_METADATA_KEY]: { enabled: nextEnabled, character: char },
      },
    })
    setOpen(false)
    toast.success(
      nextEnabled ? `Rol oyunu açık: ${char.name}` : 'Rol oyunu kapatıldı'
    )
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(active && 'text-primary')}
            onClick={() => setOpen(true)}
            aria-label="Rol oyunu"
          >
            <IconMasksTheater
              size={18}
              className={cn('text-muted-foreground', active && 'text-primary')}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {active
              ? `Rol oyunu (aktif: ${current?.character.name})`
              : 'Rol oyunu'}
          </p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rol oyunu</DialogTitle>
            <DialogDescription>
              Karakteri doldur ya da SillyTavern kartı (.json / .png) yükle. Bu
              sohbete özeldir.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                id="roleplay-enabled"
              />
              <Label htmlFor="roleplay-enabled">Bu sohbette açık</Label>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.png,application/json,image/png"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <IconUpload size={16} />
              Kart yükle
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <Label htmlFor={`rp-${f.key}`}>{f.label}</Label>
                {f.multiline ? (
                  <Textarea
                    id={`rp-${f.key}`}
                    value={char[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={f.key === 'exampleDialogue' ? 4 : 3}
                  />
                ) : (
                  <Input
                    id={`rp-${f.key}`}
                    value={char[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {current && (
              <Button variant="ghost" size="sm" onClick={() => save(false)}>
                Kapat
              </Button>
            )}
            <Button
              size="sm"
              disabled={!char.name.trim()}
              onClick={() => save(enabled)}
            >
              Kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
