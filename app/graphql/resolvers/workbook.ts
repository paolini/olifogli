import { get_authenticated_user } from "./utils";
import { Context } from "../types";
import { WithId, ObjectId } from "mongodb";
import { getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
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
    // Gli altri utenti vedono solo i raccoglitori in cui hanno almeno un foglio.
    const sheets = await getSheetsCollection()
    const visibleSheet = await sheets.findOne({
        workbookId: workbook._id,
        $or: [{ ownerId: user._id }, { 'permissions.email': user.email }],
    }, { projection: { _id: 1 } })
    if (!visibleSheet) return null;
    // Gli altri utenti ricevono i metadati pubblici; il resolver del campo
    // Workbook.commonData applica la lista dei campi consentiti.
    return {
        _id: workbook._id,
        name: workbook.name,
        commonData: workbook.commonData,
    } as WithId<Workbook>;
}
