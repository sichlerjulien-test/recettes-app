"use client"

import { Input } from "@/components/ui/input"

export function normalizeRawInput(raw: string): number | '' {
  if (raw === '') return ''
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? '' : n
}

export function applyBlurFloor(value: number | '', min: number): number {
  return value === '' ? min : value
}

interface NumberFieldProps extends Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'type' | 'inputMode' | 'pattern' | 'min'
> {
  value: number | ''
  onChange: (v: number | '') => void
  onBlur?: () => void
  min: number
}

export function NumberField({ value, onChange, onBlur, min, ...rest }: NumberFieldProps) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(normalizeRawInput(e.target.value))}
      onBlur={() => {
        if (value === '') onChange(min)
        onBlur?.()
      }}
      {...rest}
    />
  )
}
