import { check_admin, get_authenticated_user } from "./utils";
import { Context } from "../types";
import { WithId, ObjectId } from "mongodb";
import { getWorkbooksCollection } from "@/app/lib/mongodb";
import { QueryWorkbookArgs, Workbook } from "../generated";

export default async function workbook(_: unknown, { workbookId }: QueryWorkbookArgs, context: Context): Promise<WithId<Workbook> | null> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")

    const collection = await getWorkbooksCollection()

    const workbook = await collection.findOne({
        _id: new ObjectId(workbookId),
    });
    if (!workbook) return null;
    // se è admin o supervisore restituisce tutte le informazioni
    if (user.isAdmin || user.isSupervisor) return workbook;
    // Gli altri utenti ricevono i metadati pubblici; il resolver del campo
    // Workbook.commonData applica la lista dei campi consentiti.
    return {
        _id: workbook._id,
        name: workbook.name,
        commonData: workbook.commonData,
    } as WithId<Workbook>;
}
