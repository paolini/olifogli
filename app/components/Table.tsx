"use client"
import { useState, useImperativeHandle, Ref, Suspense, lazy } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useQuery, gql } from '@apollo/client';
import Papa from "papaparse"

import { schemas, AvailableSchemas } from '@/app/lib/schema'
import { Row } from '@/app/lib/models'
import { Ordering, useCriteria, filtraEOrdina } from '@/app/components/Ordering'
import ErrorElement from '@/app/components/Error'
import Loading from '@/app/components/Loading'
import { myTimestamp } from '../lib/util'
import TableInner from './TableInner'
import LoadingWrapper from './LoadingWrapper'

export interface RowWithId extends Row {
    __typename: string;
}

const GET_ROWS = gql`
  query getRows($sheetId: ObjectId!) {
    rows(sheetId: $sheetId) {
      _id
      isValid
      data
      updatedOn
    }
  }
`

export default function Table({ref, sheetId, schemaName}:{
    ref: Ref<{csv_download: () => void}>,
    sheetId: string, 
    schemaName: AvailableSchemas,
  }) {
  const schema = schemas[schemaName]
  const { loading, error, data } = useQuery<{rows:WithId<Row>[]}>(GET_ROWS, {variables: {sheetId}});
  const [ currentRowId, setCurrentRowId ] = useState<ObjectId|null>(null)
  const criteria = useCriteria(schema)
  useImperativeHandle(ref, () => ({csv_download}))
  
  if (error) return <ErrorElement error={error}/>
  if (loading || !data) return <Loading />
  if (!data) return [] // cannot really happen
  const rows = filtraEOrdina(criteria, data.rows)

  return <>
    <span>{data.rows.length} righe</span>
    {rows.length < data.rows.length && <span> ({rows.length} visualizzate)</span>}
    <br />
    <Ordering criteria={criteria}/>
      <LoadingWrapper>
        <TableInner 
          rows={rows} 
          currentRowId={currentRowId} 
          setCurrentRowId={setCurrentRowId} 
          sheetId={sheetId} 
          schema={schema}
        />
      </LoadingWrapper>
  </>

  async function csv_download() {
      const data = rows.map(row => {
          const obj: Record<string, string> = {}
          for (const key in schema.fields) {
              obj[key] = row.data[key] || ''
          }
          return obj
      })
      const filename = myTimestamp(new Date()).replace(':', '-').replace(' ', '_') + '.csv'

      downloadCSVWithPapa(
          schema.csv_header(),
          rows.map(row => schema.csv_row(row.data)),
          filename
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
