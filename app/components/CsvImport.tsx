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
  const [headerMode, setHeaderMode] = useState<'auto'|'yes'|'no'>('auto');
  const [columnMapping, setColumnMapping] = useState<number[]|null>(null);

  // Stima se la prima riga è un'intestazione
  function estimateHeaderRow(csvData: string[][]): boolean {
    if (csvData.length < 2) return false;
    const firstRow = csvData[0];
    let score = 0;
    for (let col = 0; col < firstRow.length; col++) {
      const header = firstRow[col];
      const freqMap: Record<string, number> = {};
      for (const row of csvData) {
        const val = row[col] || '';
        for (const ch of val) freqMap[ch] = (freqMap[ch] || 0) + 1;
      }
      // Calcola la probabilità che i caratteri dell'intestazione siano estratti casualmente
      let headerProb = 1;
      const total = Object.values(freqMap).reduce((a,b)=>a+b,0);
      for (const ch of header) {
        if (freqMap[ch]) headerProb *= freqMap[ch]/total;
        else headerProb *= 1/(total+1);
      }
      score += headerProb;
    }
    // Se la probabilità media è molto bassa, la prima riga è probabilmente un'intestazione
    return score/firstRow.length < 0.05;
  }

  // Calcola la probabilità media che la prima riga sia intestazione
  function getHeaderProbability(csvData: string[][]): number {
    if (csvData.length < 2) return 0;
    const firstRow = csvData[0];
    let score = 0;
    for (let col = 0; col < firstRow.length; col++) {
      const header = firstRow[col];
      const freqMap: Record<string, number> = {};
      for (const row of csvData) {
        const val = row[col] || '';
        for (const ch of val) freqMap[ch] = (freqMap[ch] || 0) + 1;
      }
      // Calcola la probabilità che i caratteri dell'intestazione siano estratti casualmente
      let headerProb = 1;
      const total = Object.values(freqMap).reduce((a,b)=>a+b,0);
      for (const ch of header) {
        if (freqMap[ch]) headerProb *= freqMap[ch]/total;
        else headerProb *= 1/(total+1);
      }
      score += headerProb;
    }
    return score/firstRow.length;
  }

  // Function to reorder CSV columns based on header matching with schema fields
  function reorderColumnsToMatchSchema(csvData: string[][]): string[][] {
    if (csvData.length === 0) return csvData;
    const headerRow = csvData[0];
    const dataRows = csvData.slice(1);
    // Create a mapping from all possible field names (including alternatives) to their preferred positions
    const fieldNameToIndex = new Map<string, number>();
    schema.fields.forEach((field, index) => {
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
      if (columnMapping.includes(csvCol)) continue;
      for (let schemaIndex = 0; schemaIndex < schema.fields.length; schemaIndex++) {
        if (usedIndices.has(schemaIndex)) continue;
        const field = schema.fields[schemaIndex];
        const allFieldNames = field.getAllNames().map(name => name.toLowerCase());
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
    setColumnMapping([...columnMapping]);
    return reorderedData;
  }

  function restoreOriginalOrder() {
    if (!columnMapping || data.length === 0) return;
    // Inverti la permutazione
    const restored: string[][] = data.map(row => {
      const originalRow: string[] = [];
      for (let i = 0; i < columnMapping.length; i++) {
        const mappedIndex = columnMapping[i];
        originalRow[mappedIndex] = row[i];
      }
      return originalRow;
    });
    setData(restored);
    setColumnMapping(null);
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
        {/* Select per intestazione sempre visibile */}
        <label className="ml-2">
          <span>Intestazioni:</span>
          <select value={headerMode} onChange={e => {
            const value = e.target.value as 'auto'|'yes'|'no'|'restore';
            if (value === 'restore') {
              restoreOriginalOrder();
              setHeaderMode('auto');
            } else {
              setHeaderMode(value);
            }
          }} className="ml-1">
            <option value="auto">detect</option>
            <option value="yes">nella prima riga</option>
            <option value="no">non ci sono</option>
            {columnMapping && <option value="restore">ripristina ordine originale</option>}
          </select>
        </label>
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
      { columnMapping && (
        <small className="text-gray-600">
          Le colonne sono state automaticamente riordinate in base alle intestazioni della prima riga del CSV.
          Puoi annullare il riordinamento delle colonne tramite le azioni qui sotto.
        </small>
      )}
      <small className="text-gray-600">
        Controlla che la corrispondenza delle colonne sia quella giusta.
        Puoi modificare l&apos;ordine delle colonne manualmente prima di procedere all&apos;importazione.
      </small>
      <br />
      { data.length > 0 
        && <CsvTable data={data} columns={columns} setData={setData} importRows={importRows} done={done} columnMapping={columnMapping} hasHeaderRow={(() => {
          if (headerMode === 'auto') return estimateHeaderRow(data);
          if (headerMode === 'yes') return true;
          return false;
        })()}/>
        }
      { data.length > 0 && columnMapping && (
        <button className="ml-2 px-2 py-1 border rounded bg-gray-100 hover:bg-gray-200" onClick={restoreOriginalOrder}>
          Ripristina ordine colonne originale
        </button>
      )}
  </div>

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse<CSVRow>(file, {
      delimiter: delimiter,
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rawData = result.data.map(row => Object.values(row));
        const detectedHeader = estimateHeaderRow(rawData);
        setHeaderMode(detectedHeader ? 'yes' : 'no');
        let finalData: string[][];
        if ((headerMode === 'auto' && detectedHeader) || headerMode === 'yes') {
          finalData = reorderColumnsToMatchSchema(rawData);
        } else {
          finalData = rawData;
        }
        setData(finalData);
      },
      error: (error) => {
        setError(`Errore nel parsing del CSV: ${error}`);
      }
    });
  };

  async function importRows(rows: string[][]): Promise<number> {
    // Determina se saltare la prima riga
    let skipHeader = false;
    if (headerMode === 'auto') {
      skipHeader = estimateHeaderRow(rows);
    } else if (headerMode === 'yes') {
      skipHeader = true;
    } else {
      skipHeader = false;
    }
    const rowsToImport = skipHeader ? rows.slice(1) : rows;
    const variables = {
        sheetId,
        columns,
        rows: rowsToImport,
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
    const detectedHeader = estimateHeaderRow(rawData);
    setHeaderMode(detectedHeader ? 'yes' : 'no');
    let finalData: string[][];
    if ((headerMode === 'auto' && detectedHeader) || headerMode === 'yes') {
      finalData = reorderColumnsToMatchSchema(rawData);
    } else {
      finalData = rawData;
    }
    setData(finalData)
  }
}

function CsvTable({data, columns, setData, importRows, done, columnMapping, hasHeaderRow}: {
    data: string[][],
    columns: string[],
    setData: (data: string[][]) => void,
    importRows: (rows: string[][]) => Promise<number>,
    done: () => void,
    columnMapping: number[]|null,
    hasHeaderRow: boolean
}) {
    const actions = {
        done: 'Procedi con l\'importazione',
        move: 'Scambia colonne',
        delete: 'Svuota colonna',
        deleteRow: 'Elimina riga',
        restoreColumns: 'Ripristina ordine colonne originale',
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
            {Object.entries(actions).map(([key, value]) =>
                (key !== 'restoreColumns' || columnMapping) ? <option key={key} value={key}>{value}</option> : null
            )}
        </select> {}
        { action==="move" && selectedFirstCol < 0 && <b>Seleziona la colonna da scambiare</b>}
        { action==="move" && selectedFirstCol >= 0 && <b>Seleziona la colonna di destinazione</b> }
        { action==="move" && selectedFirstCol >=0 && <button className="mx-1 p-1" onClick={() => {setSelectedFirstCol(-1);setSelectedLastCol(-1)}}>Annulla spostamento</button>}
        { action==="delete" && <b>Seleziona la colonna da eliminare</b>}
        { action==="deleteRow" && <b>Seleziona la riga da eliminare</b>}
        { action==="done" && <button className="bg-alert p-1" onClick={doImport}>importa i dati</button>}
        { action==="cancel" && <button className="bg-alert p-1" onClick={() => setData([])}>Annulla importazione</button>}
        { action==="restoreColumns" && columnMapping && <button className="mx-1 p-1" onClick={restoreColumns}>Ripristina</button> }
        <table><thead>
            <tr style={hasHeaderRow ? {background: '#ffeeba'} : {}}>
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
            {crop_data.map((row, index) => <tr key={index} style={hasHeaderRow && index === 0 ? {background: '#ffeeba'} : {}}>
                    { action==="deleteRow" 
                        ? <td><button onClick={() => deleteRow(index)}>elimina</button></td>
                        : <td><i>{index+1}</i></td>
                    }
                    {row.map((value, colIndex) => (
                        <td key={colIndex} style={{backgroundColor: ((selectedFirstCol <= colIndex && colIndex <= selectedLastCol) ? "#f3ff7a":"")}}>
                            {hasHeaderRow && index === 0 ? <b>{value}</b> : value}
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
        // Scarta la prima riga se ci sono le intestazioni
        const hasHeader = hasHeaderRow;
        const rowsToImport = hasHeader ? data.slice(1) : data;
        const res = await importRows(rowsToImport.map(row => row.slice(0,columns.length)))
        done()
        setAction('done')
    }

    function restoreColumns() {
        if (!columnMapping || data.length === 0) return;
        const restored: string[][] = data.map(row => {
            const originalRow: string[] = [];
            for (let i = 0; i < columnMapping.length; i++) {
                const mappedIndex = columnMapping[i];
                originalRow[mappedIndex] = row[i];
            }
            return originalRow;
        });
        setData(restored);
        setAction('move');
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