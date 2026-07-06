"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import { toast } from "sonner"
import { SejourForm, type SejourFormData } from "@/components/sejour-form"

const ApiErrorSchema = z.object({
  error: z.object({
    kind: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

const CreatedSejourSchema = z.object({
  id: z.string().uuid(),
  token: z.string().uuid(),
  url_share: z.string().optional(),
})

function extractErrorMessage(json: unknown): string {
  const parsed = ApiErrorSchema.safeParse(json)
  if (parsed.success) return parsed.data.error.message
  return "Une erreur est survenue lors de la création du séjour"
}

function parseCreatedSejour(json: unknown): { id: string; token: string } | null {
  const parsed = CreatedSejourSchema.safeParse(json)
  if (!parsed.success) return null
  return { id: parsed.data.id, token: parsed.data.token }
}

export default function NouveauSejourPage() {
  const router = useRouter()
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleSubmit(data: SejourFormData) {
    const response = await fetch("/api/sejours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        nom: data.nom === "" ? undefined : data.nom,
      }),
    })

    const json: unknown = await response.json()

    if (!response.ok) {
      toast.error(extractErrorMessage(json))
      return
    }

    const created = parseCreatedSejour(json)
    if (!created) {
      toast.error("Réponse serveur inattendue")
      return
    }

    setIsGenerating(true)
    let destination = `/sejour/${created.id}?t=${created.token}`
    try {
      const genResponse = await fetch(`/api/sejours/${created.id}/planning`, {
        method: "POST",
        headers: { "X-Sejour-Token": created.token },
      })

      if (!genResponse.ok) {
        const genJson: unknown = await genResponse.json()
        const parsed = ApiErrorSchema.safeParse(genJson)
        if (parsed.success && parsed.data.error.kind === 'pool_empty') {
          toast.error(parsed.data.error.message)
          destination = `/sejour/${created.id}/edit?t=${created.token}`
        } else {
          toast.error(extractErrorMessage(genJson))
        }
      }
    } finally {
      // Ne pas repasser isGenerating à false ici : router.push ne complète pas dans
      // ce tick, et le repasser avant le swap de page fait réapparaître le
      // formulaire (flash, TK-51). Le composant est démonté par la navigation.
      router.push(destination)
    }
  }

  return (
    <>
      {isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95">
          <div className="text-center space-y-3 px-4">
            <p className="text-xl font-semibold text-gray-900">
              Génération du planning en cours...
            </p>
            <p className="text-sm text-gray-500">
              Cela peut prendre quelques secondes.
            </p>
          </div>
        </div>
      )}
      <SejourForm
        title="Nouveau séjour"
        description="Configurez votre séjour en quelques étapes."
        onSubmit={handleSubmit}
        submitLabel="Créer et générer le planning"
      />
    </>
  )
}
