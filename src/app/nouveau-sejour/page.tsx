"use client"

import { useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { CreateSejourBodySchema, EquipmentSchema } from "@/lib/types/schemas"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

// Participants omis — sous-tâche ultérieure.
// nom étendu : empty string valide au niveau du formulaire (optionnel côté UX).
const NouveauSejourFormSchema = CreateSejourBodySchema.omit({ participants: true }).extend({
  nom: z.string().max(100).optional(),
})

type NouveauSejourFormData = z.infer<typeof NouveauSejourFormSchema>

const EQUIPEMENTS: { value: z.infer<typeof EquipmentSchema>; label: string }[] = [
  { value: "plaque", label: "Plaque de cuisson" },
  { value: "four", label: "Four" },
  { value: "micro-ondes", label: "Micro-ondes" },
  { value: "blender", label: "Blender" },
  { value: "robot", label: "Robot culinaire" },
]

function safeNumber(value: number): number {
  return Number.isNaN(value) ? 0 : value
}

export default function NouveauSejourPage() {
  const form = useForm<NouveauSejourFormData>({
    resolver: zodResolver(NouveauSejourFormSchema),
    mode: "onChange",
    defaultValues: {
      nom: "",
      nb_jours: 2,
      repartition_repas: { midis: 2, soirs: 2, brunchs: 0 },
      parametres: {
        niveau_cuisine: "facile",
        equipement_disponible: ["plaque", "four"],
        temps_disponible: "standard",
      },
    },
  })

  useEffect(() => {
    form.trigger()
  }, [form])

  function onSubmit(data: NouveauSejourFormData) {
    const normalized = {
      ...data,
      nom: data.nom === "" ? undefined : data.nom,
    }
    console.log("Form data:", normalized)
    // L'appel API viendra dans la sous-tâche suivante.
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[600px] px-4 py-8 pb-24">
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">
          Nouveau séjour
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Configurez votre séjour en quelques étapes.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>

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
                        <Input
                          type="number"
                          min={1}
                          max={7}
                          {...field}
                          value={field.value}
                          onChange={(e) => field.onChange(safeNumber(e.target.valueAsNumber))}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

                  <FormField
                    control={form.control}
                    name="repartition_repas.midis"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Midis</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            value={field.value}
                            onChange={(e) => field.onChange(safeNumber(e.target.valueAsNumber))}
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
                        <FormLabel>Soirs</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            value={field.value}
                            onChange={(e) => field.onChange(safeNumber(e.target.valueAsNumber))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="repartition_repas.brunchs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brunchs</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            value={field.value}
                            onChange={(e) => field.onChange(safeNumber(e.target.valueAsNumber))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <p className="text-xs text-gray-400">Au moins 1 repas au total</p>
              </div>
            </section>

            {/* ── Section 3 : Paramètres cuisine ── */}
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Paramètres cuisine
              </h2>
              <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-6">

                {/* Niveau de cuisine */}
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
                              <RadioGroupItem
                                id={`niveau-${niveau}`}
                                value={niveau}
                                className="sr-only"
                              />
                              {niveau === "facile" ? "Facile" : "Normal"}
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Temps disponible */}
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
                              <RadioGroupItem
                                id={`temps-${temps}`}
                                value={temps}
                                className="sr-only"
                              />
                              {temps === "rapide" ? "Rapide" : "Standard"}
                            </Label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Équipement disponible */}
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

            {/* ── Bouton de soumission ── */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!form.formState.isValid}
            >
              Continuer
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
