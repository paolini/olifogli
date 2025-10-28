import { Workbook } from "@/app/lib/models";
import { get_authenticated_user, check_admin } from "./utils";
import { Context } from "../types";
import { WithId } from "mongodb";
import { getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";

export default async function workbooks(_: unknown, __: unknown, context: Context): Promise<WithId<Workbook>[]> {
    const user = await get_authenticated_user(context)
    if (!user) throw new Error("Not authenticated")
    if (user.isAdmin) {
        const collection = await getWorkbooksCollection()
        const workbooks = await collection.find({}).toArray();

        return workbooks;
    } else {
        // considero tutti i workbooks degli sheets a cui l'utente ha accesso.
        const pipeline = [
            { $match: { $or: [
                { ownerId: user._id },
                { 'permissions.email': user.email },
                { 'permissions.userId': user._id },
            ] } },
            { $group: { _id: "$workbookId" } },
            {
                $lookup: {
                    from: 'workbooks',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'workbook'
                }
            },
            { $unwind: '$workbook' },
            { $replaceRoot: { newRoot: '$workbook' } }
        ]
        const sheets_collection = await getSheetsCollection()
        const workbooks = await sheets_collection.aggregate<WithId<Workbook>>(pipeline).toArray();
        return workbooks;
    }
}
