import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QueryWorkbookRankingReportArgs, RankingReport, ReportEntry } from '../generated'
import { ObjectId, WithId, Filter } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import { Row } from '@/app/lib/models'
import { getAllSheets } from './sheetsReportHelper'
import { schemas } from '@/app/lib/schema'
import Competition from '@/app/lib/schema/Competition'

export default async function workbookRankingReport(
    _: unknown, 
    { workbookId, schema, commonData, state, limit, selectionLabel, onlySelected, orderBy, orderDirection }: QueryWorkbookRankingReportArgs & { selectionLabel?: string | null, onlySelected?: boolean | null, orderBy?: string | null, orderDirection?: number | null }, 
    context: Context
): Promise<RankingReport[]> {
    const allSheets = await getAllSheets(new ObjectId(workbookId), schema || null, commonData || {}, state || null, context)
    const allSchemas = Array.from(new Set(allSheets.map(s => s.schema)))
    const reports: RankingReport[] = []

    for (const schema of allSchemas) {
        if (schemas[schema] instanceof Competition) {
            const sheets = allSheets.filter(s => s.schema === schema)
            const report = await generateRankingReport(sheets, limit ?? undefined, selectionLabel, onlySelected, orderBy, orderDirection)
            reports.push({
                schema,
                ...report
            })
        }
    }

    return reports
}

async function generateRankingReport(
    sheets: WithId<Sheet>[],
    limit?: number,
    selectionLabel?: string | null,
    onlySelected?: boolean | null,
    orderBy?: string | null,
    orderDirection?: number | null
) {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)

    // Costruisci il filtro per le righe (usa dot-notation per campi dentro data.*)
    const filter: Filter<Row> = { 
        sheetId: { $in: sheetIds }, 
        error: "",
    }

    if (selectionLabel) {
        if (sheets.length === 0) throw new Error("Nessun foglio disponibile per applicare il filtro di selezione")
        const schemaStrings = new Set(sheets.map(s => s.schema))
        if (schemaStrings.size > 1) throw new Error("Il filtro di selezione può essere applicato solo quando tutti i fogli hanno lo stesso schema")
        const schema = schemaStrings.values().next().value;
        if (!schema) throw new Error("Impossibile determinare lo schema dei fogli per applicare il filtro di selezione")
        const schemaObj = schemas[schema];
        const selection = schemaObj?.selections.find(s => s.label === selectionLabel);
        if (!selection) throw new Error(`Selezione "${selectionLabel}" non valida per lo schema "${schema}"`)

        if (onlySelected) {
            (filter as Record<string, unknown>)["selections.label"] = selectionLabel
        } else {
            const selection = schemaObj?.selections.find(s => s.label === selectionLabel);
            if (selection?.row_filter) {
                // Aggiungi i criteri di filtro basati su row_filter
                // row_filter è un oggetto con chiave-valore
                for (const [key, value] of Object.entries(selection.row_filter)) {
                    // Usa dot-notation: data.classYear, data.classSection, ecc.
                    (filter as Record<string, unknown>)[`data.${key}`] = value
                }
            }
        }
    }
    
    // Recupera tutte le righe dai fogli
    // console.log("Filtro per ranking report:", filter)
    const rows = await rowsCollection.find(filter).toArray()

    // Mappa con info dei fogli per riferimento veloce
    const sheetMap = new Map(sheets.map(s => [s._id.toString(), s]))

    type Entry = ReportEntry

    // Prepara le entry con punteggio
    const entries: Array<ReportEntry> = []

    for (const row of rows) {
        const sheet = sheetMap.get(row.sheetId.toString())
        if (!sheet) continue
        const schemaObj = schemas[sheet.schema]
        if (!(schemaObj instanceof Competition)) continue

        const rankingEntry = schemaObj.extract_ranking(row, sheet)
        if (!rankingEntry) continue

        entries.push(rankingEntry)
    }

    // Ordina
    if (orderBy) {
        entries.sort((a, b) => {
            let aVal: unknown, bVal: unknown;
            switch (orderBy) {
                case 'rank':
                    // Rank non calcolato, ordina per score
                    aVal = a.score;
                    bVal = b.score;
                    break;
                case 'score':
                    aVal = a.score;
                    bVal = b.score;
                    break;
                case 'studentSurname':
                    aVal = a.studentSurname;
                    bVal = b.studentSurname;
                    break;
                case 'studentName':
                    aVal = a.studentName;
                    bVal = b.studentName;
                    break;
                case 'school':
                    aVal = a.school;
                    bVal = b.school;
                    break;
                case 'sheetName':
                    aVal = a.sheetName;
                    bVal = b.sheetName;
                    break;
                case 'city':
                    aVal = a.city;
                    bVal = b.city;
                    break;
                case 'district':
                    aVal = a.district;
                    bVal = b.district;
                    break;
                case 'classYear':
                    aVal = a.classYear;
                    bVal = b.classYear;
                    break;
                case 'classSection':
                    aVal = a.classSection;
                    bVal = b.classSection;
                    break;
                default:
                    aVal = a[orderBy as keyof typeof a];
                    bVal = b[orderBy as keyof typeof b];
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * (orderDirection || 1);
            } else {
                const aStr = String(aVal || '');
                const bStr = String(bVal || '');
                return aStr.localeCompare(bStr, 'it', { sensitivity: 'base' }) * (orderDirection || 1);
            }
        });
    } else {
        // Default: ordina per punteggio decrescente
        entries.sort((a, b) => b.score - a.score);
    }

    // Se limit è definito, prendi solo i primi 'limit', altrimenti tutti
    let rankingEntries = entries;
    if (typeof limit === 'number') {
        rankingEntries = entries.slice(0, limit);
    }
    const ranking: ReportEntry[] = rankingEntries.map((entry, index) => ({
        ...entry,
        rank: index + 1,
        sheet: sheetMap.get(entry.sheetId.toString())!
    }))

    return {
        totalStudents: entries.length,
        ranking,
    }
}
