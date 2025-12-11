import { Context } from '../types'
import { getRowsCollection } from '@/app/lib/mongodb'
import { QuerySheetsAgeDistributionReportArgs, AgeDistributionReport, AgeDistributionItem } from '../generated'
import { ObjectId, WithId } from 'mongodb'
import { Sheet } from '@/app/lib/models'
import sheetsReportHelper from './sheetsReportHelper'

export default async function sheetsAgeDistributionReport(
    _: unknown, 
    { sheetIds, schema }: QuerySheetsAgeDistributionReportArgs, 
    context: Context
): Promise<AgeDistributionReport> {
    const allSheets = await sheetsReportHelper(sheetIds.map(id => new ObjectId(id)), context)

    // Separa per schema
    const sheets = allSheets.filter(s => s.schema === schema)

    return {
        schema,
        ...await generateAgeDistributionReport(sheets)
    }
}

async function generateAgeDistributionReport(sheets: WithId<Sheet>[]) {
    const rowsCollection = await getRowsCollection() // Ottieni la collezione delle righe
    const sheetIds = sheets.map(s => s._id)
    const items: AgeDistributionItem[] = []
    
    // Recupera tutte le righe dai fogli
    const rows = await rowsCollection.find({
        sheetId: { $in: sheetIds }
    }).toArray()

    const currentYear = new Date().getFullYear()

    // Raggruppa
    function getAge(date: Date): number {
        const year = date.getFullYear()
        return currentYear - year
    }

    const ageMap = new Map<number, number>()
    for (const row of rows) {
        const birthDateValue = row.data?.birthDate
        const birthDate = new Date(birthDateValue)
        if (isNaN(birthDate.getTime())) continue // Salta date non valide
        let age = getAge(birthDate)
        if (age < 0) age = 0;
        if (age > 100) age = 100; // Limita età massima a 100
        ageMap.set(age, (ageMap.get(age) || 0) + 1)
    }
    // Converti in array e ordina per età
    for (const [age, rows] of Array.from(ageMap.entries()).sort((a, b) => a[0] - b[0])) {
        items.push({ age, rows })
    }

    // Calcola media e varianza
    const ages = Array.from(items)
    const totalRows = ages.reduce((sum, item) => sum + item.rows, 0)
    const mean = ages.length > 0 ? ages.reduce((sum, item) => sum + (item.age * item.rows), 0) / totalRows : null
    const variance = ages.length > 0 ? ages.reduce((sum, item) => sum + (item.rows * Math.pow(item.age - (mean as number), 2)), 0) / totalRows : null
    

    return {
        items,
        totalRows,
        mean,
        variance,
    }
}