"use client"

import { Input } from "@/components/ui/input"

export function normalizeRawInput(raw: string): number | '' {
  if (raw === '') return ''
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? '' : n
}

interface NumberFieldProps extends Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'type' | 'inputMode' | 'pattern' | 'min'
> {
  value: number | ''
  onChange: (v: number | '') => void
  onBlur?: () => void
}

export function NumberField({ value, onChange, onBlur, ...rest }: NumberFieldProps) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(normalizeRawInput(e.target.value))}
      onBlur={() => onBlur?.()}
      {...rest}
    />
  )
}
