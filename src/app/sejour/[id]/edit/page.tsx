import { getSejourById } from "@/lib/db/sejours"
import { getPlanningBySejourId } from "@/lib/db/plannings"
import { redirect } from "next/navigation"
import { EditSejourClient } from "./_components/EditSejourClient"

export default async function EditSejourPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { id } = await params
  const { t: token } = await searchParams

  if (!token) {
    redirect("/")
  }

  const sejourResult = await getSejourById(id)

  if (!sejourResult.ok) {
    redirect("/")
  }

  if (sejourResult.sejour.token !== token) {
    redirect("/")
  }

  const planningResult = await getPlanningBySejourId(id)
  const hasPlanning = planningResult.ok

  return (
    <EditSejourClient
      sejour={sejourResult.sejour}
      token={token}
      hasPlanning={hasPlanning}
    />
  )
}
