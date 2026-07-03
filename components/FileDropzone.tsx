'use client'

import { useCallback, useState } from 'react'
import { Upload, X, File as FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes, getFileIcon, MAX_EXTERNAL_SIZE, MAX_LAN_SIZE } from '@/lib/fileUtils'
import { Badge } from '@/components/ui/badge'

interface FileDropzoneProps {
  onFileSelect: (file: File) => void
  mode: 'lan' | 'external'
  disabled?: boolean
  selectedFile?: File | null
  onClear?: () => void
}

export function FileDropzone({ onFileSelect, mode, disabled, selectedFile, onClear }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxSize = mode === 'lan' ? MAX_LAN_SIZE : MAX_EXTERNAL_SIZE
  const maxLabel = mode === 'lan' ? '1 GB' : '50 MB'

  const validate = useCallback(
    (file: File): string | null => {
      if (file.size > maxSize) {
        return `File too large. Max ${maxLabel} for ${mode === 'lan' ? 'LAN' : 'external'} mode.`
      }
      return null
    },
    [maxSize, maxLabel, mode]
  )

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file)
      if (err) {
        setError(err)
        return
      }
      setError(null)
      onFileSelect(file)
    },
    [validate, onFileSelect]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile]
  )

  if (selectedFile) {
    return (
      <div className="relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-500/20 text-3xl">
            {getFileIcon(selectedFile.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{selectedFile.name}</p>
            <p className="text-sm text-white/50">{formatBytes(selectedFile.size)}</p>
          </div>
          {onClear && (
            <button
              onClick={onClear}
              className="rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label
        className={cn(
          'group relative flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200',
          dragging
            ? 'border-violet-400 bg-violet-500/10 scale-[1.01]'
            : 'border-white/20 bg-white/5 hover:border-violet-400/60 hover:bg-white/8',
          disabled && 'pointer-events-none opacity-50'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          id="file-input"
          type="file"
          className="sr-only"
          onChange={onInputChange}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <div className={cn(
            'flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-200',
            dragging ? 'bg-violet-500/30 scale-110' : 'bg-white/10 group-hover:bg-violet-500/20'
          )}>
            <Upload className={cn(
              'h-8 w-8 transition-colors',
              dragging ? 'text-violet-400' : 'text-white/50 group-hover:text-violet-400'
            )} />
          </div>
          <div>
            <p className="text-lg font-medium text-white">
              {dragging ? 'Drop it!' : 'Drop file here'}
            </p>
            <p className="mt-1 text-sm text-white/50">
              or <span className="text-violet-400 underline underline-offset-2">browse files</span>
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-white/20 bg-white/5 text-white/60 backdrop-blur-sm"
          >
            {mode === 'lan' ? '⚡ Up to 1 GB via LAN' : '🔗 Up to 50 MB via Cloud'}
          </Badge>
        </div>
      </label>
      {error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400 border border-red-500/20">
          ⚠ {error}
        </p>
      )}
    </div>
  )
}
