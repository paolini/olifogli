"use client"
import Papa from "papaparse";
import { useState } from "react";
import { gql, useApolloClient, useMutation } from "@apollo/client"
import { schemas, AvailableSchemas } from "../lib/schema";
import Error from './Error'

//import { Distrettuale } from '@/lib/schema'
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

export default function CsvImport({schemaName, sheetId}:{
    schemaName: AvailableSchemas,
    sheetId: string,
}) {
  const schema = schemas[schemaName]
  const columns = schema.fields;
  const numeroRisposte = 17;
  const [delimiter, setDelimiter] = useState<string>('')
  const client = useApolloClient();
  const [addRows] = useMutation(ADD_ROWS);
  const [data, setData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)

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
      { error && <Error error={error} />}
      <br />
      { data.length > 0 
        && <CsvTable data={data} columns={columns} numeroRisposte={numeroRisposte} setData={setData} importRows={importRows}/>
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
        nAnswers: numeroRisposte,
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
}

function CsvTable({data, columns, numeroRisposte, setData, importRows}: {
    data: string[][],
    columns: string[],
    numeroRisposte: number,
    setData: (data: string[][]) => void,
    importRows: (rows: string[][]) => Promise<number>
}) {
    const actions = {
        done: 'Procedi con l\'importazione',
        move: 'Sposta colonna',
        delete: 'Elimina colonna',
        deleteRow: 'Elimina riga',
        cancel: 'Annulla importazione',
    }
    type Action = keyof typeof actions
    const [action, setAction] = useState<Action|'busy'>('move')
    const [selectedFirstCol, setSelectedFirstCol] = useState<number>(-1)
    const [selectedLastCol, setSelectedLastCol] = useState<number>(-1)
    const allColumns = [...columns, ...Array.from({length: numeroRisposte}, (_, i) => i+1)]
    const hideFrom = data.length>200 ? 100 : data.length
    const hideTo = data.length>200 ? data.length-100 : 0

    return <>
        Numero righe: <b>{data.length}</b>
        <br/>
        <select disabled={action==="busy"} value={action} onChange={(e) => setAction(e.target.value as Action)}>
            {Object.entries(actions).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select> {}
        { action==="move" && selectedFirstCol < 0 && <b>Seleziona la colonna da spostare</b>}
        { action==="move" && selectedFirstCol >= 0 && <b>Seleziona la colonna di destinazione</b> }
        { action==="move" && selectedFirstCol >=0 && <button onClick={() => {setSelectedFirstCol(-1);setSelectedLastCol(-1)}}>Annulla spostamento</button>}
        { action==="delete" && <b>Seleziona la colonna da eliminare</b>}
        { action==="deleteRow" && <b>Seleziona la riga da eliminare</b>}
        { action==="done" && <button onClick={doImport}>importa i dati</button>}
        { action==="cancel" && <button onClick={() => setData([])}>Annulla importazione</button>}
        <table><thead>
            <tr>
                { action==="deleteRow" && <th></th>}
                {allColumns.map((t, index) => <th key={index}>
                    {selectedFirstCol<0 ? t : <button onClick={() => moveColumns(index)}>{t}</button>}
                </th>)}
            </tr>
            <tr>
                { action==="deleteRow" && <th></th>}
                {Array.from({length: columns.length + numeroRisposte}, (_,i) => i).map(index => 
                    <td key={index}>
                    { action==="move" && selectedFirstCol === -1 && <button onClick={() => {setSelectedFirstCol(index);setSelectedLastCol(index)}}>sposta</button> }
                    { action==="delete" && <button onClick={() => deleteColumn(index)}>elimina</button>}
                    </td>)}
            </tr>
        </thead>
        <tbody>
            {data.map((row, index) => (index<hideFrom || index>=hideTo) 
                ? <tr key={index}>
                    { action==="deleteRow" && <td><button onClick={() => setData(data.filter((_, i) => i !== index))}>elimina</button></td>}
                    {row.map((value, index) => (
                        <td key={index} style={{backgroundColor: ((selectedFirstCol <= index && index <= selectedLastCol) ? "#f3ff7a":"")}}>{value}</td>
                    ))}
                </tr>
                : (index===hideFrom && <tr key={index}><td colSpan={columns.length + numeroRisposte}>...</td></tr>)    
            )}
        </tbody>
        </table>
    </>

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

    async function doImport() {
        setAction('busy')
        const res = await importRows(data.map(row => row.slice(0,columns.length)))
        setAction('done')
    }

}
