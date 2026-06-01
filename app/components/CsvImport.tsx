"use client"
import Papa from "papaparse";
import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client"
import { ObjectId } from 'bson'

import { schemas } from "../lib/schema"
import Error from './Error'
import { Field } from "../lib/schema/fields";
import Button from "./Button";

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
  const columns = schema.fields
  const [delimiter, setDelimiter] = useState<string>('')
  const client = useApolloClient()
  const [addRows] = useMutation(ADD_ROWS);
  const [data, setData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)
  const [headerMode, setHeaderMode] = useState<'auto'|'yes'|'no'>('auto');
  const [columnMapping, setColumnMapping] = useState<number[]|null>(null);

  const fieldList = columns
    .filter(field => field.editable && !field.csv_import_ignore)
    .map(field => field.name).join(', ');

  return <div className="p-4 border rounded-lg shadow-md">
    <div>
    <small>Il file CSV può essere ottenuto da qualunque <i>foglio di calcolo</i>. 
    Conviene mantenere la prima riga con le intestazioni delle colonne, 
    in modo che il sistema possa tentare di abbinare automaticamente le colonne del CSV ai campi dello schema.
    Verranno cercati nomi simili ai seguenti: {}
    <span className="text-gray-600">{fieldList}.</span>
    </small>
    </div>
    <br />
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
        <Button className="mx-2"
          disabled={data.length>0}
          onClick={handlePasteCsv}
        >
          Incolla da clipboard
        </Button>
      { data.length === 0 && 
        <Button variant="alert" onClick={() => done()}>
          annulla importazione
        </Button> }
      <br />
      <Error error={error} />
      { data.length > 0 && columnMapping &&
      <small className="text-gray-600">
          Le colonne sono state automaticamente riordinate in base alle intestazioni della prima riga del CSV.
          Puoi annullare il riordinamento delle colonne tramite le azioni qui sotto.
      </small>}
      { data.length > 0 && <p>
        <small className="text-gray-600">
          Controlla che la corrispondenza delle colonne sia quella giusta.
          Puoi modificare l&apos;ordine delle colonne manualmente prima di procedere all&apos;importazione.
        </small>
      </p>}
      <br />
      { data.length > 0 
        && <CsvTable data={data} columns={columns} setData={setData} importRows={importRows} done={done} columnMapping={columnMapping} hasHeaderRow={(() => {
          if (headerMode === 'auto') return estimateHeaderRow(data);
          if (headerMode === 'yes') return true;
          return false;
        })()}/>
        }
      { data.length > 0 && columnMapping && (
        <Button className="my-2" onClick={restoreOriginalOrder}>
          Ripristina ordine originale colonne
        </Button>
      )}
  </div>

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
      if (!field.csv_import_ignore) {
        field.getAllNames().forEach(name => {
          fieldNameToIndex.set(name.toLowerCase(), index);
        });
      }
    });
    schema.fields_to_be_ignored_on_inport.forEach(name => {
      const key = name.toLowerCase();
      if (!fieldNameToIndex.has(key)) {
        fieldNameToIndex.set(key, -1);
      }
    });
    let last_column = schema.fields.length
    // Find the best matching order for CSV columns
    const columnMapping: number[] = [];
    const usedIndices = new Set<number>();
    // First pass: exact matches
    for (let csvCol = 0; csvCol < headerRow.length; csvCol++) {
      const csvHeader = headerRow[csvCol].toLowerCase().trim();
      const schemaIndex = fieldNameToIndex.get(csvHeader);
      if (schemaIndex === -1) {
        columnMapping[last_column++] = csvCol;
      } else if (schemaIndex !== undefined && !usedIndices.has(schemaIndex)) {
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

  async function importRows(rows: string[][]): Promise<boolean> {
    const variables = {
        sheetId,
        columns: columns.map(field => field.name),
        rows
    }

    try {
        const res = await addRows({variables});
        
        if (!res.data) {
            console.log(`res.data`, res.errors);
            if (res.errors) setError(res.errors?.map(e => `${e}`).join(', '))
            else setError(`Qualcosa è andato storto`)
            return false;
        }
        await client.reFetchObservableQueries();
        setData([]);
        return true;
    } catch(error) {
        setError(`${error}`)
        return false;
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
    columns: Field[],
    setData: (data: string[][]) => void,
    importRows: (rows: string[][]) => Promise<boolean>,
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
    const [action, setAction] = useState<Action|'busy'>('done')
    const [selectedFirstCol, setSelectedFirstCol] = useState<number>(-1)
    const [selectedLastCol, setSelectedLastCol] = useState<number>(-1)
    const [maxShownRows, setMaxShownRows] = useState<number>(20)
    const [removedLineCount, setRemovedLineCount] = useState<number>(0)
    const [dateFormat, setDateFormat] = useState<'gg/mm/aa'|'mm/gg/aa'>('gg/mm/aa')

    if (data.length === 0) return <Error error="tabella vuota" />
    const first_row = data[0];

    const filled_column_headers = [...columns.map(field => field.header || field.name)]

    for (let i = columns.length; i < first_row.length; i++) {
        filled_column_headers[i] = ''
    }

    const header_row = hasHeaderRow ? data[0] : null
    const crop_data = data
      .slice(hasHeaderRow ? 1 : 0, maxShownRows)
      .map(convertRow)

    return <>
        Numero righe: <b>{data.length}</b>
        { removedLineCount > 0 && <>
            <br />
            <span className="bg-alert p-1">Righe eliminate:</span> <b>{removedLineCount}</b>
        </>} {}
        <select value={dateFormat} onChange={e => setDateFormat(e.target.value as 'gg/mm/aa'|'mm/gg/aa')}>
            <option value="gg/mm/aa">Formato date: gg/mm/aa</option>
            <option value="mm/gg/aa">Formato date: mm/gg/aa</option>
        </select>
        <br />
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
                {filled_column_headers.map((t, index) => <th key={index}>
                    { ["move", "delete"].includes(action) 
                        ? <button className="px-1" onClick={() => clickColumn(index)}>{t||'▿'}</button>
                        : t
                    }
                </th>)}
            </tr>
        </thead>
        <tbody>
            {/* Riga vuota per separazione visiva */}
            <tr className="h-1">
            </tr>
            {
              header_row && <tr style={{background: '#ffeeba'}}>
                  <td></td>
                    {header_row.map((value, colIndex) => 
                        <td key={colIndex}>
                          <b>{value}</b>   
                        </td>)
                    }
                </tr>
            }
            {crop_data.map((row, index) => <tr key={index}>
                    { action==="deleteRow" 
                        ? <td><button onClick={() => deleteRow(index)}>elimina</button></td>
                        : <td><i>{index+1}</i></td>
                    }
                    {row.map((value, colIndex) => {
                      const isSelected = selectedFirstCol <= colIndex && colIndex <= selectedLastCol;
                      const isWarning = columns[colIndex] && columns[colIndex].type === 'date' && value && !validDate(value);                      
                      return (
                        <td key={colIndex} style={{backgroundColor: (isSelected ? "#f3ff7a": isWarning ? "#ffb3b3" : "transparent")}}>
                          {value}
                        </td>)
                    })}
                </tr>
            )}
            {crop_data.length < data.length &&
                <tr>
                    <td colSpan={columns.length}>
                        <Button onClick={() => setMaxShownRows(maxShownRows*2)}>Mostra altre righe</Button>
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

    // converte le date da formato gg/mm/aa a mm/gg/aa o viceversa, a seconda del formato selezionato
    function convertRow(row: string[]): string[] {
      return row.map((value, column_index) => {
        if (columns[column_index] && columns[column_index].type === 'date' && value) {
          if (dateFormat === 'mm/gg/aa') {
              const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
              if (m) {
                return `${m[2]}/${m[1]}/${m[3]}`
              }
          }
        }
        return value;
      })
    }

    async function doImport() {
        setAction('busy')
        // Scarta la prima riga se ci sono le intestazioni
        const hasHeader = hasHeaderRow;
        const rowsToImport = hasHeader ? data.slice(1) : data;
        const res = await importRows(rowsToImport
          .map(convertRow)
          .map(row => row.slice(0,columns.length)))
        if (res) {
          setAction('done')
          done()
        } else {
          // è stato settato un errore, non abbandonare la pagina!
        }
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

    function validDate(s: string): boolean {
      // esempio: 1/2/2008
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (!m) return false;
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      if (month < 1 || month > 12) return false;
      if (day < 1) return false;
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day > daysInMonth) return false;
      return true;
    }

}
