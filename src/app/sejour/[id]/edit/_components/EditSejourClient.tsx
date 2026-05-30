"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { SejourForm, type SejourFormData } from "@/components/sejour-form"
import { Button } from "@/components/ui/button"
import type { Sejour } from "@/lib/types/domain"
import { determineRegenerationAction } from "@/lib/ui/regeneration"

interface Props {
  sejour: Sejour
  token: string
  hasPlanning: boolean
}

function sejourToFormValues(sejour: Sejour): SejourFormData {
  return {
    nom: sejour.nom,
    date_debut: sejour.date_debut,
    nb_jours: sejour.nb_jours,
    repartition_repas: sejour.repartition_repas,
    parametres: sejour.parametres,
    participants: sejour.participants.map((p) => ({
      nom: p.nom,
      allergies: p.allergies,
      regimes: p.regimes,
      aime: p.aime,
      n_aime_pas: p.n_aime_pas,
    })),
  }
}

export function EditSejourClient({ sejour, token, hasPlanning }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  async function generatePlanning() {
    setIsGenerating(true)
    try {
      const response = await fetch(`/api/sejours/${sejour.id}/planning`, {
        method: "POST",
        headers: { "X-Sejour-Token": token },
      })

      if (!response.ok) {
        const json: unknown = await response.json()
        const message =
          typeof json === "object" && json !== null && "error" in json &&
          typeof (json as { error: unknown }).error === "object" &&
          (json as { error: { message?: unknown } }).error !== null &&
          typeof (json as { error: { message?: unknown } }).error.message === "string"
            ? (json as { error: { message: string } }).error.message
            : "Erreur lors de la génération du planning"
        toast.error(message)
      } else {
        toast.success("Planning généré")
      }
    } finally {
      setIsGenerating(false)
      router.push(`/sejour/${sejour.id}?t=${token}`)
    }
  }

  async function handleSubmit(data: SejourFormData) {
    const response = await fetch(`/api/sejours/${sejour.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Sejour-Token": token,
      },
      body: JSON.stringify({
        ...data,
        nom: data.nom === "" ? undefined : data.nom,
      }),
    })

    const json: unknown = await response.json()

    if (!response.ok) {
      const message =
        typeof json === "object" && json !== null && "error" in json &&
        typeof (json as { error: unknown }).error === "object" &&
        (json as { error: { message?: unknown } }).error !== null &&
        typeof (json as { error: { message?: unknown } }).error.message === "string"
          ? (json as { error: { message: string } }).error.message
          : "Erreur lors de la modification du séjour"
      toast.error(message)
      return
    }

    toast.success("Séjour modifié")

    const action = determineRegenerationAction(hasPlanning)
    if (action === 'confirm') {
      setShowModal(true)
    } else {
      await generatePlanning()
    }
  }

  function handleModalCancel() {
    setShowModal(false)
    router.push(`/sejour/${sejour.id}?t=${token}`)
  }

  async function handleModalRegenerate() {
    setShowModal(false)
    await generatePlanning()
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

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 space-y-4 shadow-xl">
            <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
              Régénérer le planning ?
            </h2>
            <p className="text-sm text-gray-600">
              Tu as déjà un planning pour ce séjour. Le régénérer l&apos;écrasera. Continuer ?
            </p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleModalCancel}
              >
                Annuler
              </Button>
              <Button
                className="flex-1"
                onClick={handleModalRegenerate}
              >
                Régénérer
              </Button>
            </div>
          </div>
        </div>
      )}

      <SejourForm
        defaultValues={sejourToFormValues(sejour)}
        onSubmit={handleSubmit}
        title="Modifier le séjour"
        description="Modifiez les informations de votre séjour."
        submitLabel="Enregistrer les modifications"
      />
    </>
  )
}
