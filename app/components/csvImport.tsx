import { useState } from "react";

import Papa from "papaparse";

interface CSVRow {
  [key: string]: string;
}

export default function CsvImport({columns, numeroRisposte, addRow}:{
    columns: string[],
    numeroRisposte: number,
    addRow: (row: string[]) => Promise<void>
}) {
  const [data, setData] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse<CSVRow>(file, {
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

  return <div className="p-4 border rounded-lg shadow-md">
    csv import {}
      <input type="file" accept=".csv" onChange={handleFileUpload} className="mb-2" />
      { error && <div className="text-red-500">{error}</div>}
      <br />
      { data.length > 0 && <CsvTable data={data} columns={columns} numeroRisposte={numeroRisposte} setData={setData} importRow={addRow}/>}
  </div>
}

function CsvTable({data, columns, numeroRisposte, setData, importRow}: {
    data: string[][],
    columns: string[],
    numeroRisposte: number,
    setData: (data: string[][]) => void,
    importRow: (row: string[]) => Promise<void>
}) {
    const [action, setAction] = useState<'move'|'delete'|'deleteRow'|'done'|'busy'>('move')
    const [selectedFirstCol, setSelectedFirstCol] = useState<number>(-1)
    const [selectedLastCol, setSelectedLastCol] = useState<number>(-1)
    const allColumns = [...columns, ...Array.from({length: numeroRisposte}, (_, i) => i+1)]
  
    return <>
        Numero righe: <b>{data.length}</b>
        <br/>
        <select disabled={action==="busy"} value={action} onChange={(e) => setAction(e.target.value as 'move'|'delete')}>
            <option value="done">Procedi con l&apos;importazione</option>
            <option value="move">Sposta colonna</option>
            <option value="delete">Elimina colonna</option>
            <option value="deleteRow">Elimina riga</option>
        </select> {}
        { action==="move" && selectedFirstCol < 0 && <b>Seleziona la colonna da spostare</b>}
        { action==="move" && selectedFirstCol >= 0 && <b>Seleziona la colonna di destinazione</b> }
        { action==="move" && selectedFirstCol >=0 && <button onClick={() => {setSelectedFirstCol(-1);setSelectedLastCol(-1)}}>Annulla spostamento</button>}
        { action==="delete" && <b>Seleziona la colonna da eliminare</b>}
        { action==="deleteRow" && <b>Seleziona la riga da eliminare</b>}
        { action==="done" && <button onClick={doImport}>importa i dati</button>}
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
            {data.map((row, index) => <tr key={index}>
                { action==="deleteRow" && <td><button onClick={() => setData(data.filter((_, i) => i !== index))}>elimina</button></td>}
                {row.map((value, index) => (
                    <td key={index} style={{backgroundColor: ((selectedFirstCol <= index && index <= selectedLastCol) ? "#f3ff7a":"")}}>{value}</td>
                ))}
            </tr>)}
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
        while (true) {
            const row = data.shift()
            if (row === undefined) break
            await importRow(row)
            setData(data)
        }
        setAction('done')
    }

}