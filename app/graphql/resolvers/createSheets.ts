import { getRowsCollection, getSheetsCollection, getWorkbooksCollection } from "@/app/lib/mongodb";
import { CreateSheetsResult, MutationCreateSheetsArgs } from "../generated";
import { Context } from "../types";
import { schemas } from "@/app/lib/schema";
import { ObjectId } from "mongodb";
import { Sheet, Row, Permission, Data } from "@/app/lib/models";

export default async function createSheets(
  _: unknown,
  args: MutationCreateSheetsArgs,
  context: Context
): Promise<CreateSheetsResult> {
    const { sheetId, rowIds, dry } = args;

    let sheets_created = 0;
    let sheets_updated = 0;
    let rows_created = 0;
    let error = '';
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

    const rowsCollection = await getRowsCollection();
    const sheetsCache = new Map<string, Sheet>();
    const sheetsRowIncrements = new Map<string, { nRows: number, nValidRows: number, anomalies: number }>();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { sheetId };
    if (rowIds) {
        query._id = { $in: rowIds };
    }

    console.log(`Starting to process rows for sheet ${sheetId}... query: `, query);

    for await (const row of rowsCollection.find(query)) {
        console.log(`Processing row ${row._id} ${JSON.stringify({row})}`);
        const data = schema.row_to_sheet(row);
        console.log(`  Result: ${JSON.stringify(data)}`);
        if (typeof data === 'string') {
            error = `Error processing row ${row._id}: ${data}\n`;
            break;
        }
        if (!data) {
            error = `No sheet data returned for row ${row._id}\n`;
            break;
        }

        if (typeof data === 'string') {
            error = `Error in row payload for ${row._id}: ${data}\n`;
            break;
        }

        // Trova il foglio di destinazione (cache o DB)
        let targetSheet = sheetsCache.get(data.sheet.name);
        if (!targetSheet) {
            const existingSheet = await sheetsCollection.findOne({
                workbookId: importSheet.workbookId,
                name: data.sheet.name
            });

            if (existingSheet) {
                targetSheet = existingSheet;
                const updateSheet: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    $set?: any
                } = {}
                let permissions: Permission[] = targetSheet.permissions || [];
                let permissionsChanged = false;
                for (const perm of data.sheet.permissions || []) {
                    if (permissions.find(p => p.email === perm.email && p.role === perm.role)) continue
                    permissions = permissions.filter(p => p.email !== perm.email);
                    permissions.push(perm);
                    permissionsChanged = true;
                }
                if (permissionsChanged) {
                    updateSheet.$set = updateSheet.$set || {};
                    updateSheet.$set.permissions = permissions;
                }
                for (const key of Object.keys(data.sheet.data || {})) {
                    if (targetSheet.commonData[key] !== data.sheet.data![key]) {
                        updateSheet.$set = updateSheet.$set || {};
                        updateSheet.$set[`commonData.${key}`] = data.sheet.data![key];
                    }
                }
                if (Object.keys(updateSheet).length > 0) {
                    if (dry) {
                        console.log("Dry run: db.sheets.updateOne: ", 
                            {_id: targetSheet._id, updateSheet});
                    } else {
                        await sheetsCollection.updateOne(
                            { _id: targetSheet._id },
                            updateSheet
                        );
                    }
                    sheets_updated++;
                } else {
                    console.log(`No updates needed for sheet ${targetSheet._id}`);
                }
            } else {
                // Crea nuovo foglio
                const newSheet: Sheet = {
                    _id: new ObjectId(),
                    name: data.sheet.name,
                    schema: data.sheet.schema,
                    ownerId: importSheet.ownerId,
                    workbookId: importSheet.workbookId,
                    permissions: data.sheet.permissions || [],
                    commonData: data.sheet.data || {},
                    createdAt: now,
                    updatedAt: now,
                    nRows: 0,
                    nValidRows: 0,
                    nSyncedRows: 0,
                    anomalies: 0,
                    nScanJobs: 0,
                    nScanSheetJobs: 0
                };
                if (dry) {
                    console.log("Dry run: db.sheets.insertOne: ", newSheet);
                } else {
                    await sheetsCollection.insertOne(newSheet);
                }
                targetSheet = newSheet;
                sheets_created++;
            }
            sheetsCache.set(data.sheet.name, targetSheet);
        }

        if (data.row) {
            const targetSchema = schemas[targetSheet.schema];
            let rowData = targetSchema.clean(data.row.data || {});

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uniqueKeys = (data.row as any).unique_keys;
            if (uniqueKeys && Array.isArray(uniqueKeys) && uniqueKeys.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const uniqueQuery: any = { sheetId: targetSheet._id };
                for (const key of uniqueKeys) {
                    uniqueQuery[`data.${key}`] = rowData[key];
                }
                const existingRow = await rowsCollection.findOne(uniqueQuery);
                if (existingRow) {
                    console.log(`Skipping duplicate row in sheet ${targetSheet.name}. Keys: ${uniqueKeys.join(', ')}`);
                    continue;
                }
            }

            const derivedData = await targetSchema.computeDerivedData(rowData, targetSheet.commonData, workbook.commonData);
            rowData = derivedData.data;
            const error = derivedData.error || '';
            const anomalies = derivedData.anomalies || 0;
            const isValid = error === '';

            // Crea nuova riga
            const newRow: Row = {
                _id: new ObjectId(),
                sheetId: targetSheet._id,
                data: rowData,
                error: error,
                anomalies: anomalies,
                createdOn: now,
                createdBy: 'system',
                updatedOn: now,
                updatedBy: 'system'
            };

            if (dry) {
                console.log("Dry run: db.rows.insertOne: ", newRow);
            } else {
                await rowsCollection.insertOne(newRow);
            }
            rows_created++;

            // Aggiorna conteggi
            const current = sheetsRowIncrements.get(targetSheet._id.toHexString()) || { nRows: 0, nValidRows: 0, anomalies: 0 };
            current.nRows++;
            if (isValid) current.nValidRows++;
            current.anomalies += anomalies;
            sheetsRowIncrements.set(targetSheet._id.toHexString(), current);
        }

        // Aggiorna conteggi dei fogli alla fine
        if (!dry) {
            for (const [sId, incs] of sheetsRowIncrements) {
                await sheetsCollection.updateOne(
                    { _id: new ObjectId(sId) },
                    { 
                        $inc: { nRows: incs.nRows, nValidRows: incs.nValidRows, anomalies: incs.anomalies },
                        $set: { updatedAt: now }
                    }
                );
            }
        }
        sheets_updated = sheetsRowIncrements.size;
    }
    console.log(`Finished processing rows for sheet ${sheetId}. Created sheets: ${sheets_created}, updated sheets: ${sheets_updated}, created rows: ${rows_created}`);
    return {
        sheets_created,
        sheets_updated,
        rows_created,
        rows_updated: 0,
        error,
    }
}