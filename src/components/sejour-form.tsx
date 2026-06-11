"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"

import { setupZodFr } from "@/lib/zod-config"
import { CreateSejourBodySchema, EquipmentSchema, AllergenSchema, ExclusionTagSchema } from "@/lib/types/schemas"
import {
  ALLERGEN_LABELS,
  REGIME_LABELS,
  EU14_ALLERGENS,
} from "@/lib/ui/labels"
import type { Allergen, DietaryRestriction } from "@/lib/ui/labels"
import type { ExclusionTag } from "@/lib/types/domain"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { NumberField } from "@/components/ui/number-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Accepte number | '' en saisie, produit number en sortie.
// Permet à NumberField de maintenir un champ vide sans snap NaN→0 par frappe.
const Count = (c: z.ZodNumber) =>
  z.union([z.number(), z.literal('')])
    .transform((v): number => v === '' ? 0 : v)
    .pipe(c)

// Réécrit sans .default([]) pour aligner les types input/output Zod
// (exactOptionalPropertyTypes cause une incompatibilité resolver sinon).
export const SejourFormSchema = CreateSejourBodySchema.extend({
  nom: z.string().max(100).optional(),
  nb_jours: Count(z.number().int().min(1).max(7)),
  repartition_repas: CreateSejourBodySchema.shape.repartition_repas.extend({
    midis: Count(z.number().int().nonnegative()),
    soirs: Count(z.number().int().nonnegative()),
    brunchs: Count(z.number().int().nonnegative()),
  }),
  participants: z.array(z.object({
    nom: z.string().min(1).max(50),
    allergies: z.array(AllergenSchema),
    exclusions: z.array(ExclusionTagSchema),
    aime: z.array(z.string()),
    n_aime_pas: z.array(z.string()),
  })).min(1).max(12),
})

export type SejourFormData = z.infer<typeof SejourFormSchema>

const EQUIPEMENTS: { value: z.infer<typeof EquipmentSchema>; label: string }[] = [
  { value: "plaque", label: "Plaque de cuisson" },
  { value: "four", label: "Four" },
  { value: "micro-ondes", label: "Micro-ondes" },
  { value: "blender", label: "Blender" },
  { value: "robot", label: "Robot culinaire" },
]

const PREMIER_REPAS_OPTIONS: { value: 'matin' | 'midi' | 'soir'; label: string }[] = [
  { value: "matin", label: "Matin (petit-déjeuner)" },
  { value: "midi", label: "Midi" },
  { value: "soir", label: "Soir" },
]

const EMPTY_PARTICIPANT = {
  nom: "",
  allergies: [] as Allergen[],
  exclusions: [] as ExclusionTag[],
  aime: [] as string[],
  n_aime_pas: [] as string[],
}

const DEFAULT_FORM_VALUES: SejourFormData = {
  nom: "",
  nb_jours: 2,
  repartition_repas: { premier_repas: "matin", midis: 2, soirs: 2, brunchs: 0 },
  parametres: {
    niveau_cuisine: "facile",
    equipement_disponible: ["plaque", "four"],
    temps_disponible: "standard",
  },
  participants: [{ ...EMPTY_PARTICIPANT }],
}

function safeNumber(value: number | ''): number {
  if (value === '') return 0
  return Number.isNaN(value) ? 0 : value
}

type RepasValidation =
  | { type: 'error'; message: string }
  | { type: 'warning'; message: string }
  | null

function computeRepasValidation(
  nbJours: number,
  midis: number,
  soirs: number,
  brunchs: number,
): RepasValidation {
  const total = midis + soirs + brunchs
  const max = nbJours * 3
  const min = 3 * (nbJours - 1)
  if (total > max) {
    return {
      type: 'error',
      message: "Le nombre de repas dépasse la capacité du séjour (3 repas par jour maximum).",
    }
  }
  if (total < min) {
    return {
      type: 'warning',
      message: "Certains créneaux ne seront pas couverts — est-ce intentionnel ?",
    }
  }
  return null
}

interface SejourFormProps {
  defaultValues?: Partial<SejourFormData>
  onSubmit: (data: SejourFormData) => Promise<void>
  title?: string
  description?: string
  submitLabel?: string
}

export function SejourForm({
  defaultValues,
  onSubmit,
  title,
  description,
  submitLabel = "Continuer",
}: SejourFormProps) {
  setupZodFr()

  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<z.input<typeof SejourFormSchema>, unknown, z.output<typeof SejourFormSchema>>({
    resolver: zodResolver(SejourFormSchema),
    mode: "onTouched",
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      ...defaultValues,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "participants",
  })

  const participants = form.watch("participants")
  const nbJours = safeNumber(form.watch("nb_jours"))
  const midis = safeNumber(form.watch("repartition_repas.midis"))
  const soirs = safeNumber(form.watch("repartition_repas.soirs"))
  const brunchs = safeNumber(form.watch("repartition_repas.brunchs"))

  const repasValidation = computeRepasValidation(nbJours, midis, soirs, brunchs)

  function toggleAllergen(index: number, allergen: Allergen) {
    const allParticipants = form.getValues("participants")
    const participant = allParticipants[index]
    if (!participant) return
    form.setValue(
      "participants",
      allParticipants.map((p, i) =>
        i === index
          ? {
              ...p,
              allergies: p.allergies.includes(allergen)
                ? p.allergies.filter((a) => a !== allergen)
                : [...p.allergies, allergen],
            }
          : p,
      ),
    )
  }

  function toggleRegime(index: number, regime: DietaryRestriction) {
    const allParticipants = form.getValues("participants")
    const participant = allParticipants[index]
    if (!participant) return
    form.setValue(
      "participants",
      allParticipants.map((p, i) =>
        i === index
          ? {
              ...p,
              exclusions: p.exclusions.includes(regime as ExclusionTag)
                ? p.exclusions.filter((r) => r !== regime)
                : [...p.exclusions, regime as ExclusionTag],
            }
          : p,
      ),
    )
  }

  async function handleSubmit(data: SejourFormData) {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Une erreur est survenue"
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[600px] px-4 py-8 pb-24">
        {title && (
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
            {title}
          </h1>
        )}
        {description && (
          <p className="mb-8 text-sm text-gray-500">
            {description}
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8" noValidate>

            {/* ── Section 1 : Informations générales ── */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Informations générales
              </h2>
              <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">

                <FormField
                  control={form.control}
                  name="nom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du séjour <span className="font-normal text-gray-400">(optionnel)</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex : Chalet montagne juillet"
                          maxLength={100}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date_debut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de début <span className="font-normal text-gray-400">(optionnel)</span></FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nb_jours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de jours</FormLabel>
                      <FormControl>
                        <NumberField
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            {/* ── Section 2 : Répartition des repas ── */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Répartition des repas
              </h2>
              <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Combien de repas voulez-vous planifier ? Pour 3 midis sur 3 jours, mettez 3.
                </p>

                <FormField
                  control={form.control}
                  name="repartition_repas.premier_repas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Premier repas du séjour</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                        >
                          {PREMIER_REPAS_OPTIONS.map(({ value, label }) => (
                            <Label
                              key={value}
                              htmlFor={`premier-repas-${value}`}
                              className={[
                                "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-3 text-sm font-medium transition-colors text-center",
                                field.value === value
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                              ].join(" ")}
                            >
                              <span className="sr-only">
                                <RadioGroupItem
                                  id={`premier-repas-${value}`}
                                  value={value}
                                />
                              </span>
                              {label}
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                  <FormField
                    control={form.control}
                    name="repartition_repas.brunchs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Petit-déjeuner</FormLabel>
                        <FormControl>
                          <NumberField
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="repartition_repas.midis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Midi</FormLabel>
                        <FormControl>
                          <NumberField
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="repartition_repas.soirs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Soir</FormLabel>
                        <FormControl>
                          <NumberField
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {repasValidation !== null && (
                  <p
                    className={[
                      "text-sm rounded-lg px-3 py-2",
                      repasValidation.type === 'error'
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200",
                    ].join(" ")}
                    role={repasValidation.type === 'error' ? "alert" : "status"}
                  >
                    {repasValidation.message}
                  </p>
                )}
              </div>
            </section>

            {/* ── Section 3 : Paramètres cuisine ── */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Paramètres cuisine
              </h2>
              <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-6">

                <FormField
                  control={form.control}
                  name="parametres.niveau_cuisine"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Niveau de cuisine</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="grid grid-cols-2 gap-2"
                        >
                          {(["facile", "normal"] as const).map((niveau) => (
                            <Label
                              key={niveau}
                              htmlFor={`niveau-${niveau}`}
                              className={[
                                "flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                                field.value === niveau
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                              ].join(" ")}
                            >
                              <span className="sr-only">
                                <RadioGroupItem
                                  id={`niveau-${niveau}`}
                                  value={niveau}
                                />
                              </span>
                              {niveau === "facile" ? "Facile" : "Normal"}
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parametres.temps_disponible"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temps disponible</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="grid grid-cols-2 gap-2"
                        >
                          {(["rapide", "standard"] as const).map((temps) => (
                            <Label
                              key={temps}
                              htmlFor={`temps-${temps}`}
                              className={[
                                "flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                                field.value === temps
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                              ].join(" ")}
                            >
                              <span className="sr-only">
                                <RadioGroupItem
                                  id={`temps-${temps}`}
                                  value={temps}
                                />
                              </span>
                              {temps === "rapide" ? "Rapide" : "Standard"}
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parametres.equipement_disponible"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Équipement disponible</FormLabel>
                      <div className="mt-2 space-y-2">
                        {EQUIPEMENTS.map(({ value, label }) => {
                          const checked = field.value.includes(value)
                          return (
                            <div key={value} className="flex items-center gap-3">
                              <Checkbox
                                id={`equip-${value}`}
                                checked={checked}
                                onCheckedChange={(isChecked) => {
                                  if (isChecked) {
                                    field.onChange([...field.value, value])
                                  } else {
                                    field.onChange(field.value.filter((v) => v !== value))
                                  }
                                }}
                              />
                              <Label htmlFor={`equip-${value}`} className="cursor-pointer font-normal">
                                {label}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            {/* ── Section 4 : Participants ── */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Participants
              </h2>

              <div className="space-y-4">
                {fields.map((field, index) => {
                  const participantAllergies = participants[index]?.allergies ?? []
                  const participantRegimes = participants[index]?.exclusions ?? []
                  return (
                    <div
                      key={field.id}
                      className="rounded-xl border border-gray-100 bg-white p-4 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">
                          Participant {index + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={fields.length === 1}
                          onClick={() => remove(index)}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                          aria-label={`Supprimer le participant ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <FormField
                        control={form.control}
                        name={`participants.${index}.nom`}
                        render={({ field: nomField }) => (
                          <FormItem>
                            <FormLabel>Nom</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Ex : Alice"
                                maxLength={50}
                                {...nomField}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-700">Allergies</p>
                        <div className="flex flex-wrap gap-2">
                          {EU14_ALLERGENS.map((allergen) => {
                            const isSelected = participantAllergies.includes(allergen)
                            return (
                              <Button
                                key={allergen}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleAllergen(index, allergen)}
                              >
                                {ALLERGEN_LABELS[allergen]}
                              </Button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700">Préférences alimentaires</p>
                        <div className="flex flex-wrap gap-2">
                          {(['vegetarien', 'vegan'] as const).map((preset) => {
                            const isSelected = participantRegimes.includes(preset)
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => toggleRegime(index, preset)}
                                className={[
                                  "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                                  isSelected
                                    ? "border-gray-400 bg-gray-100 text-gray-800"
                                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50",
                                ].join(" ")}
                              >
                                {REGIME_LABELS[preset]}
                              </button>
                            )
                          })}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs text-gray-400">Ou, plus précisément :</p>
                          <div className="flex flex-wrap gap-2">
                            {(['sans-viande-rouge', 'sans-porc', 'sans-poisson', 'sans-fruits-de-mer', 'sans-alcool'] as const).map((atomic) => {
                              const isSelected = participantRegimes.includes(atomic)
                              return (
                                <button
                                  key={atomic}
                                  type="button"
                                  onClick={() => toggleRegime(index, atomic)}
                                  className={[
                                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    isSelected
                                      ? "border-gray-400 bg-gray-100 text-gray-700"
                                      : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:bg-gray-50",
                                  ].join(" ")}
                                >
                                  {REGIME_LABELS[atomic]}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={fields.length >= 12}
                onClick={() => append({ ...EMPTY_PARTICIPANT })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un participant
              </Button>
            </section>

            {/* ── Bouton de soumission ── */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!form.formState.isValid || isSubmitting || repasValidation?.type === 'error'}
            >
              {isSubmitting ? "Chargement..." : submitLabel}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
