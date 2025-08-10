import { Workbook } from "@/app/lib/models";
import { get_authenticated_user } from "./utils";
import { Context } from "../types";
import { WithId, ObjectId } from "mongodb";
import { getWorkbooksCollection } from "@/app/lib/mongodb";

export default async function workbook(_: unknown, { workbookId }: { workbookId: string }, context: Context): Promise<WithId<Workbook> | null> {
    const user = await get_authenticated_user(context);
    if (!user) {
        throw new Error("Not authenticated");
    }

    const collection = await getWorkbooksCollection()

    // per adesso non facciamo controlli sui permessi

    const workbook = await collection.findOne({
        _id: new ObjectId(workbookId),
    });

    return workbook;
}
