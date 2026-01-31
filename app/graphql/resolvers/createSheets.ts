import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { CreateSheetsResult, MutationCreateSheetsArgs } from "../generated";
import { Context } from "../types";
import { schemas } from "@/app/lib/schema";

export default async function createSheets(
  _: unknown,
{sheetId, rowIds}: MutationCreateSheetsArgs,
context: Context): Promise<CreateSheetsResult> {    
    const sheets_created = 0;
    const sheets_updated = 0;
    const rows_created = 0;
    const rows_updated = 0;
    let error = '';

    const sheeteCollection = await getSheetsCollection();
    const sheet = await sheeteCollection.findOne({_id: sheetId});
    if (!sheet) {
        throw new Error('Sheet not found');
    }
    const schema = schemas[sheet.schema];
    if (!schema.row_to_sheet) {
        throw new Error(`Create sheets functionality not available for schema "${schema.name}"`);
    }

    const rowsCollection = await getRowsCollection();
    for await (const row of rowsCollection.find({
        sheet_id: sheetId,
        ...(rowIds ? { _id: { $in: rowIds } } : {})
    })) {
        const result = schema.row_to_sheet(row);
        if (typeof result === 'string') {
            error = `Error processing row ${row._id}: ${result}\n`;
            break;
        }
        if (!result) {
            error = `No sheet data returned for row ${row._id}\n`;
            break;
        }
        // Here you can add logic to create or update sheets and rows based on the result
    }
    return {
        sheets_created,
        sheets_updated,
        rows_created,
        rows_updated,
        error,
    }
}