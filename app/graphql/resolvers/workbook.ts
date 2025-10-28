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
    // se non è admin restituisce tutte le informazioni
    if (user.isAdmin) return workbook;
    // altrimenti limita i dati al nome 
    return {
        _id: workbook._id,
        name: workbook.name,
    } as WithId<Workbook>;
}
