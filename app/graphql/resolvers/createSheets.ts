import { CreateSheetsResult, MutationCreateSheetsArgs } from "../generated";
import { Context } from "../types";

export default async function createSheets(
  _: unknown,
args: MutationCreateSheetsArgs,
context: Context): Promise<CreateSheetsResult> {
    return {
        sheets_created: 0,
        sheets_updated: 0,
        rows_created: 0,
        rows_updated: 0,
        error: ''
    }
}