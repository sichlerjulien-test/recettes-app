import { z } from "zod"

let configured = false

export function setupZodFr(): void {
  if (configured) return
  z.config(z.locales.fr())
  configured = true
}
