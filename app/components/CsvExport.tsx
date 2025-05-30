import {useState} from "react"
import Papa from "papaparse"

import { Schema } from "@/app/lib/schema"
import { Row } from "@/app/lib/models"
import Button from "./Button"

export default function CsvExport({schema, rows}:{
    schema: Schema,
    rows: Row[]
}) {
    return <Button onClick={() => download()}>scarica CSV</Button>

    async function download() {
        const data = rows.map(row => {
            const obj: Record<string, string> = {}
            for (const key in schema.fields) {
                obj[key] = row.data[key] || ''
            }
            return obj
        })
        const now = new Date();

        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');

        const HH = String(now.getHours()).padStart(2, '0');
        const MM = String(now.getMinutes()).padStart(2, '0');

        downloadCSVWithPapa(
            schema.csv_header(),
            rows.map(row => schema.csv_row(row.data)),
            `${schema.name}-${yyyy}-${mm}-${dd}-${HH}-${MM}.csv`
        )
    }
}

function downloadCSVWithPapa(fields: string[], rows: string[][], filename = "dati.csv") {
    const csv = Papa.unparse({
        fields: fields,
        data: rows
    }); // converte array di oggetti o array di array
  
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
  
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  