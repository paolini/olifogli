import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { MutationCreateSheetsArgs } from "../generated";
import { Context } from "../types";
import { schemas } from "@/app/lib/schema";
import { ObjectId, WithoutId } from "mongodb";
import { Sheet, Row } from "@/app/lib/models";
import { RowToSheetsResult } from "@/app/lib/schema/Schema";

export default async function createSheets(
  _: unknown,
  args: MutationCreateSheetsArgs,
  context: Context
): Promise<string> {
    const { sheetId, rowIds, dry } = args;

    const ret = {
        sheets_created: 0,
        sheets_updated: 0,
        sheets_unchanged: 0,
        rows_created: 0,
        rows_skipped: 0,
        error: '',
    };

    const now = new Date();

    const sheetsCollection = await getSheetsCollection();
    const importSheet = await sheetsCollection.findOne({_id: new ObjectId(sheetId)});
    if (!importSheet) {
        throw new Error('Sheet not found');
    }

    const schema = schemas[importSheet.schema];
    if (!schema.row_to_sheet) {
        throw new Error(`Create sheets functionality not available for schema "${schema.name}"`);
    }

    const workbooksCollection = await getWorkbooksCollection();
    const workbook = await workbooksCollection.findOne({_id: importSheet.workbookId});
    if (!workbook) throw new Error('Workbook not found');

    const contest_id = workbook.commonData['olimanager_contest_id'] || '';

    const rowsCollection = await getRowsCollection();

    const query: {
        sheetId: ObjectId,
        _id?: { $in: ObjectId[] }
    } = { sheetId };

    if (rowIds) {
        query._id = { $in: rowIds };
    }

    console.log(`Starting to process rows for sheet ${sheetId}... query: `, query);

    const sheets: Record<string, {
        _id: ObjectId,
        original: Sheet
        updated: Sheet
    }> = {};

    for await (const row of rowsCollection.find(query)) {
        console.log(`Processing row ${row._id}`, row.data);
        const data = schema.row_to_sheet(row);
        console.log(`  data:`, data);

        if (typeof data === 'string') {
            return `Error processing row ${row._id}: ${data}\n`;
        }
        if (!data) {
            return `No sheet data returned for row ${row._id}\n`;
        }

        try {
            await create_or_update_sheet(data)
        } catch (e) {
            return `${JSON.stringify(ret)} + Error creating/updating sheet for row ${row._id}: ${(e as Error).message}\n`;
        }

        if (data.row) {
            await create_or_update_row(data);
        }
    }
    
    await persist_sheets();

    console.log(`Finished processing rows for sheet ${sheetId}.`, ret);

    return JSON.stringify(ret);

    async function create_or_update_sheet(data: RowToSheetsResult) {
        const name = data.sheet.name;
        if (!sheets[name]) {
            const original = await sheetsCollection.findOne({
                workbookId: importSheet!.workbookId,
                name:name
            });
            if (original) {
                if (original.schema !== data.sheet.schema) {
                    throw new Error(`Schema mismatch for sheet "${name}": existing schema is "${original.schema}", new schema is "${data.sheet.schema}"`);
                }
                sheets[name] = {
                    _id: original._id,
                    original,
                    updated: {...original},
                }
            } else {
                const payload: WithoutId<Sheet> = {
                    workbookId: importSheet!.workbookId,
                    name: name,
                    ownerId: context.user_id!,
                    schema: data.sheet.schema,
                    permissions: data.sheet.permissions || [],
                    commonData: data.sheet.data || {},
                    nRows: 0,
                    nValidRows: 0,
                    nSyncedRows: 0,
                    anomalies: 0,
                    nScanJobs: 0,
                    nScanSheetJobs: 0,
                    createdAt: now,
                    updatedAt: now,
                }
                let _id: ObjectId;
                if (dry) {
                    console.log("Dry run: would create sheet with payload:", payload);
                    _id = new ObjectId();
                } else {
                    console.log("Creating sheet with payload:", payload);
                    const res = await sheetsCollection.insertOne(payload);
                    _id = res.insertedId;
                }
                ret.sheets_created++;
                sheets[name] = {
                    _id,
                    original: {
                        _id,
                        ...payload
                    },
                    updated: {
                        _id,
                        ...payload
                    },
                }
            }
        }

        const sheet = sheets[name].updated;

        for (const perm of data.sheet.permissions || []) {
            if (sheet.permissions.find(p => p.email === perm.email && p.role === perm.role)) continue
            sheet.permissions = sheet.permissions.filter(p => p.email !== perm.email);
            sheet.permissions.push(perm);
        }

        sheet.commonData = {
            ...sheet.commonData,
            ...(data.sheet.data || {})
        }
    }

    async function persist_sheets() {
        for (const sheetName of Object.keys(sheets)) {
            const sheetEntry = sheets[sheetName];
            const original = sheetEntry.original;
            const updated = sheetEntry.updated;

            const $set: Partial<Sheet> = {};
            let changed = false;
            for (const key of Object.keys(updated)) {
                // @ts-expect-error: dynamic key access
                if (JSON.stringify(updated[key]) !== JSON.stringify(original[key])) {
                    // @ts-expect-error: dynamic key access
                    $set[key] = updated[key];
                    changed = true;
                }
            }
            if (changed) {
                $set.updatedAt = now;
                if (dry) {
                    console.log(`Dry run. Would update sheet ${original._id} with`, $set);
                } else {
                    console.log(`Updating sheet "${sheetName}" (${original._id})`, $set);
                    await sheetsCollection.updateOne(
                        { _id: original._id },
                        { $set }
                    );
                }
                ret.sheets_updated++;
            } else {
                console.log(`No changes for sheet "${sheetName}" (${original._id})`);
                ret.sheets_unchanged++;
            }
       }
    }

    async function create_or_update_row(data: RowToSheetsResult) {
        if (!data.row) {
            console.log("No row data to create/update");
            return;
        }

        const sheet = sheets[data.sheet.name].updated;

        if (true) {
            // controlla se la riga c'è già
            const query = data.row.unique_keys.reduce((acc, key) => {
                    acc[`data.${key}`] = data.row!.data[key];
                    return acc;
                }, {} as Record<string, string>);
            console.log(`Checking for existing row with query:`, { sheetId: sheet._id, ...query });
            const row = await rowsCollection.findOne({
                sheetId: sheet._id,
                ...query
            });
            if (row) {
                console.log(`Row already exists with id ${row._id}, skipping creation.`);
                ret.rows_skipped++;
                return;
            } 
        }

        const schema = schemas[sheet.schema];
        const validationContext = schema.validationContext(sheet.commonData, workbook!.commonData);
        const derivedData = await schema.computeDerivedData(data.row.data, validationContext);
        const rowData = derivedData.data;
        const error = derivedData.error || '';
        const anomalies = derivedData.anomalies || 0;

        const row: WithoutId<Row> = {
            sheetId: sheet._id,
            data: rowData,
            error,
            anomalies,
            createdOn: now,
            createdBy: 'system',
            updatedOn: now,
            updatedBy: 'system'
        };

        if (data.row.olimanager?.participantId) {
            row.olimanager = {
                participantId: data.row.olimanager.participantId,
                error: '',
            };
            if (data.row.olimanager.contestId) {
                row.olimanager.contestId = data.row.olimanager.contestId;
            } else if (contest_id) {
                row.olimanager.contestId = contest_id;
            }
        }

        if (dry) {
            console.log("Dry run: would create row with data:", row);
        } else {
            const res = await rowsCollection.insertOne(row);
            if (!res) throw new Error('Failed to insert row');
        }
        ret.rows_created++;
        sheet.nRows++;
        if (!error) {
            sheet.nValidRows++;
        }
        sheet.anomalies += anomalies;
    } 
}
