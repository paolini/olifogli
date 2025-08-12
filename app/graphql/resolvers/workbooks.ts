import { Workbook } from "@/app/lib/models";
import { get_authenticated_user, check_admin } from "./utils";
import { Context } from "../types";
import { WithId } from "mongodb";
import { getWorkbooksCollection } from "@/app/lib/mongodb";

export default async function workbooks(_: unknown, __: unknown, context: Context): Promise<WithId<Workbook>[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")
    check_admin(user)

    const collection = await getWorkbooksCollection()

    // Per adesso non facciamo controlli sui permessi

    const workbooks = await collection.find({
    }).toArray();

    return workbooks;
}
