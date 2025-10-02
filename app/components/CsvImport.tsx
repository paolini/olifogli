"use client"
import Papa from "papaparse";
import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client"
import { ObjectId } from 'bson'

import { schemas } from "../lib/schema"
import Error from './Error'

const ADD_ROWS = gql`
    mutation addRows(
        $sheetId: ObjectId!, 
        $columns: [String!]!,
        $rows: [[String!]!]!
    ) {
        addRows(sheetId: $sheetId, columns: $columns, rows: $rows) 
    }`

interface CSVRow {
  [key: string]: string;
}

export default function CsvImport({schemaName, sheetId, done}:{
    schemaName: string,
    sheetId: ObjectId,
    done: () => void,
}) {
  const schema = schemas[schemaName]
  const columns = schema.fields.map(field => field.name)
  const [delimiter, setDelimiter] = useState<string>('')
  const client = useApolloClient()
  const [addRows] = useMutation(ADD_ROWS);
  const [data, setData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)

  // Function to reorder CSV columns based on header matching with schema fields
  function reorderColumnsToMatchSchema(csvData: string[][]): string[][] {
    if (csvData.length === 0) return csvData;
    
    const headerRow = csvData[0];
    const dataRows = csvData.slice(1);
    
    // Create a mapping from all possible field names (including alternatives) to their preferred positions
    const fieldNameToIndex = new Map<string, number>();
    schema.fields.forEach((field, index) => {
      // Add main name and all alternative names
      field.getAllNames().forEach(name => {
        fieldNameToIndex.set(name.toLowerCase(), index);
      });
    });
    
    // Find the best matching order for CSV columns
    const columnMapping: number[] = [];
    const usedIndices = new Set<number>();
    
    // First pass: exact matches
    for (let csvCol = 0; csvCol < headerRow.length; csvCol++) {
      const csvHeader = headerRow[csvCol].toLowerCase().trim();
      const schemaIndex = fieldNameToIndex.get(csvHeader);
      
      if (schemaIndex !== undefined && !usedIndices.has(schemaIndex)) {
        columnMapping[schemaIndex] = csvCol;
        usedIndices.add(schemaIndex);
      }
    }
    
    // Second pass: partial matches (contains)
    for (let csvCol = 0; csvCol < headerRow.length; csvCol++) {
      const csvHeader = headerRow[csvCol].toLowerCase().trim();
      
      // Skip if this CSV column is already mapped
      if (columnMapping.includes(csvCol)) continue;
      
      for (let schemaIndex = 0; schemaIndex < schema.fields.length; schemaIndex++) {
        if (usedIndices.has(schemaIndex)) continue;
        
        const field = schema.fields[schemaIndex];
        const allFieldNames = field.getAllNames().map(name => name.toLowerCase());
        
        // Check if any field name is contained in CSV header or vice versa
        const hasMatch = allFieldNames.some(fieldName => 
          csvHeader.includes(fieldName) || fieldName.includes(csvHeader)
        );
        
        if (hasMatch) {
          columnMapping[schemaIndex] = csvCol;
          usedIndices.add(schemaIndex);
          break;
        }
      }
    }
    
    // Fill remaining positions with unmapped CSV columns
    let nextAvailableCsvCol = 0;
    for (let schemaIndex = 0; schemaIndex < Math.max(schema.fields.length, headerRow.length); schemaIndex++) {
      if (columnMapping[schemaIndex] === undefined) {
        // Find next unmapped CSV column
        while (nextAvailableCsvCol < headerRow.length && columnMapping.includes(nextAvailableCsvCol)) {
          nextAvailableCsvCol++;
        }
        if (nextAvailableCsvCol < headerRow.length) {
          columnMapping[schemaIndex] = nextAvailableCsvCol;
          nextAvailableCsvCol++;
        }
      }
    }
    
    // Reorder all rows according to the mapping
    const reorderedData: string[][] = [];
    
    for (const row of csvData) {
      const reorderedRow: string[] = [];
      for (let schemaIndex = 0; schemaIndex < Math.max(schema.fields.length, row.length); schemaIndex++) {
        const csvIndex = columnMapping[schemaIndex];
        if (csvIndex !== undefined && csvIndex < row.length) {
          reorderedRow[schemaIndex] = row[csvIndex];
        } else {
          reorderedRow[schemaIndex] = '';
        }
      }
      reorderedData.push(reorderedRow);
    }
    
    return reorderedData;
  }

  return <div className="p-4 border rounded-lg shadow-md">
      Caricamento di dati tramite file CSV  &nbsp; &nbsp;
        <input type="file" 
            disabled={data.length>0} 
            accept=".csv" 
            onChange={handleFileUpload} 
            className="mb-2"         
            onClick={event => { (event.target as HTMLInputElement).value = '' }}
        />
        {} Delimitatore:
        <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
            <option value="">detect</option>
            <option value="\t">tab</option>
            <option value=",">comma</option>
            <option value=";">semicolon</option>
        </select>  
        <button
          className="ml-2 px-2 py-1 border rounded bg-gray-100 hover:bg-gray-200"
          disabled={data.length>0}
          onClick={handlePasteCsv}
          type="button"
        >
          Incolla da clipboard
        </button>
      { error && <Error error={error} />}
      <br />
      <small className="text-gray-600">
        Le colonne vengono automaticamente riordinate in base alle intestazioni della prima riga del CSV. 
        Puoi comunque modificare l'ordine manualmente dopo il caricamento.
      </small>
      <br />
      { data.length > 0 
        && <CsvTable data={data} columns={columns} setData={setData} importRows={importRows} done={done}/>
        }
  </div>

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse<CSVRow>(file, {
      delimiter: delimiter,
      header: false, // Se il CSV ha intestazioni
      skipEmptyLines: true,
      complete: (result) => {
        const rawData = result.data.map(row => Object.values(row));
        const reorderedData = reorderColumnsToMatchSchema(rawData);
        setData(reorderedData);
      },
      error: (error) => {
        setError(`Errore nel parsing del CSV: ${error}`);
      }
    });
  };

  async function importRows(rows: string[][]): Promise<number> {
    const variables = {
        sheetId,
        columns,
        rows,
    }

    try {
        const res = await addRows({variables});
        
        if (!res.data) {
            console.log(`res.data`, res.errors);
            if (res.errors) setError(res.errors?.map(e => `${e}`).join(', '))
            else setError(`Qualcosa è andato storto`)
            return 0
        }
        await client.reFetchObservableQueries();
        setData([]);
        return res.data.addRow;
    } catch(error) {
        setError(`${error}`)
        return 0
    }    
    
  }

  async function handlePasteCsv() {
    const text = await navigator.clipboard.readText()
    const rawData = text.split('\n').map(row => row.split('\t'))
    const reorderedData = reorderColumnsToMatchSchema(rawData);
    setData(reorderedData)
  }
}

function CsvTable({data, columns, setData, importRows, done}: {
    data: string[][],
    columns: string[],
    setData: (data: string[][]) => void,
    importRows: (rows: string[][]) => Promise<number>,
    done: () => void
}) {
    const actions = {
        done: 'Procedi con l\'importazione',
        move: 'Scambia colonne',
        delete: 'Svuota colonna',
        deleteFirstRow: 'Elimina prima riga', 
        deleteRow: 'Elimina riga',
        cancel: 'Annulla importazione',
    }
    type Action = keyof typeof actions
    const [action, setAction] = useState<Action|'busy'>('move')
    const [selectedFirstCol, setSelectedFirstCol] = useState<number>(-1)
    const [selectedLastCol, setSelectedLastCol] = useState<number>(-1)
    const [maxShownRows, setMaxShownRows] = useState<number>(20)
    const [removedLineCount, setRemovedLineCount] = useState<number>(0)

    if (data.length === 0) return <Error error="tabella vuota" />
    const first_row = data[0];

    const filled_columns = [...columns]

    for (let i = columns.length; i < first_row.length; i++) {
        filled_columns[i] = ''
    }

    const crop_data = data.slice(0, maxShownRows)

    return <>
        Numero righe: <b>{data.length}</b>
        { removedLineCount > 0 && <>
            <br />
            <span className="bg-alert p-1">Righe eliminate:</span> <b>{removedLineCount}</b>
        </>}
        <br/>
        <select className="my-1 p-1" disabled={action==="busy"} value={action} onChange={(e) => selectAction(e.target.value as Action)}>
            {Object.entries(actions).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select> {}
        { action==="move" && selectedFirstCol < 0 && <b>Seleziona la colonna da scambiare</b>}
        { action==="move" && selectedFirstCol >= 0 && <b>Seleziona la colonna di destinazione</b> }
        { action==="move" && selectedFirstCol >=0 && <button className="mx-1 p-1" onClick={() => {setSelectedFirstCol(-1);setSelectedLastCol(-1)}}>Annulla spostamento</button>}
        { action==="delete" && <b>Seleziona la colonna da eliminare</b>}
        { action==="deleteFirstRow" && <button className="bg-alert p-1" onClick={() => {deleteRow(0);selectAction("move")}}>Elimina la prima riga</button>}
        { action==="deleteRow" && <b>Seleziona la riga da eliminare</b>}
        { action==="done" && <button className="bg-alert p-1" onClick={doImport}>importa i dati</button>}
        { action==="cancel" && <button className="bg-alert p-1" onClick={() => setData([])}>Annulla importazione</button>}
        <table><thead>
            <tr>
                <th>#</th>
                {filled_columns.map((t, index) => <th key={index}>
                    { ["move", "delete"].includes(action) 
                        ? <button className="px-1" onClick={() => clickColumn(index)}>{t||'▿'}</button>
                        : t
                    }
                </th>)}
            </tr>
        </thead>
        <tbody>
            {crop_data.map((row, index) => <tr key={index}>
                    { action==="deleteRow" 
                        ? <td><button onClick={() => deleteRow(index)}>elimina</button></td>
                        : <td><i>{index+1}</i></td>
                    }
                    {row.map((value, index) => (
                        <td key={index} style={{backgroundColor: ((selectedFirstCol <= index && index <= selectedLastCol) ? "#f3ff7a":"")}}>
                            {value}
                        </td>
                    ))}
                </tr>
            )}
            {crop_data.length < data.length &&
                <tr>
                    <td colSpan={columns.length}>
                        <button onClick={() => setMaxShownRows(maxShownRows*2)}>Mostra altre righe</button>
                    </td>
                </tr>
            }
        </tbody>
        </table>
    </>

    function selectAction(action: Action) {
        setAction(action)
        setSelectedFirstCol(-1)
        setSelectedLastCol(-1)
    }

    function clickColumn(index: number) {
        if (action === 'move') {
            if (selectedFirstCol < 0) {
                setSelectedFirstCol(index)
                setSelectedLastCol(index)
            } else {
                moveColumns(index)
            }
        } 
        if (action === 'delete') {
            deleteColumn(index)
        }
    }

    function moveColumns(to: number) {
        setData(data.map(row => {
            for (let from = selectedFirstCol; from <= selectedLastCol; from++) {
                const value = row[from]
                row[from] = row[to]
                row[to] = value
            }
            return row
        }))
        setSelectedFirstCol(-1)
        setSelectedLastCol(-1)
    }

    function deleteColumn(index: number) {
        setData(data.map(row => {
            row[index] = ''
            return row
        }))
    }

    function deleteRow(index: number) {
        setData(data.filter((_, i) => i !== index))
        setRemovedLineCount(removedLineCount + 1)
    }

    async function doImport() {
        setAction('busy')
        const res = await importRows(data.map(row => row.slice(0,columns.length)))
        done()
        setAction('done')
    }

}

function myZip(arr1: string[], arr2: string[]) {
    const maxLength = Math.max(arr1.length, arr2.length);
    const result = [];
  
    for (let i = 0; i < maxLength; i++) {
      result.push([
        i < arr1.length ? arr1[i] : '',
        i < arr2.length ? arr2[i] : ''
      ]);
    }
  
    return result;
  }