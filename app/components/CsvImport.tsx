"use client"
import Papa from "papaparse";
import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client"

import { schemas } from "../lib/schema";
import Error from './Error'
import { Bayes, transpose } from "../lib/bayesian"

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
    sheetId: string,
    done: () => void,
}) {
  const schema = schemas[schemaName]
  const columns = schema.fields.map(field => field.name)
  const [delimiter, setDelimiter] = useState<string>('')
  const client = useApolloClient()
  const [addRows] = useMutation(ADD_ROWS);
  const [data, setData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)

  const bayes = transpose(data).map((col, i) => 
    new Bayes(col))

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
      { data.length > 0 
        && <CsvTable bayes={bayes} data={data} columns={columns} setData={setData} importRows={importRows} done={done}/>
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
        setData(result.data.map(row => Object.values(row)));
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
    setData(text.split('\n').map(row => row.split('\t')))
  }
}

function CsvTable({bayes, data, columns, setData, importRows, done}: {
    bayes: Bayes[],
    data: string[][],
    columns: string[],
    setData: (data: string[][]) => void,
    importRows: (rows: string[][]) => Promise<number>,
    done: () => void
}) {
    const actions = {
        done: 'Procedi con l\'importazione',
        move: 'Sposta colonna',
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
        { action==="move" && selectedFirstCol < 0 && <b>Seleziona la colonna da spostare</b>}
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