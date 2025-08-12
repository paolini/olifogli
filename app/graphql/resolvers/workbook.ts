import { Workbook } from "@/app/lib/models";
import { check_admin, get_authenticated_user } from "./utils";
import { Context } from "../types";
import { WithId, ObjectId } from "mongodb";
import { getWorkbooksCollection } from "@/app/lib/mongodb";
import { QueryWorkbookArgs } from "../generated";

export default async function workbook(_: unknown, { workbookId }: QueryWorkbookArgs, context: Context): Promise<WithId<Workbook> | null> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")
    check_admin(user)

    const collection = await getWorkbooksCollection()

    // per adesso non facciamo controlli sui permessi

    const workbook = await collection.findOne({
        _id: new ObjectId(workbookId),
    });

    return workbook;
}
