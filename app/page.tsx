"use client"
import { useState, useEffect } from 'react'
import { tipo_risposte, RowWithId } from '@/lib/answers'

export default function Home() {
  return <Table></Table>
}

function Table() {
  const [rows, setRows] = useState<RowWithId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTableData();

    async function loadTableData() {
      try {
        setLoading(true);
        const data = await fetchData();
        if (data.data) {
          setRows(data.data);
          setError(null);
        } else {
          setError(`Failed to load data. ${data?.error || 'Server error'}`);
        }
      } catch(err) {
        if (err instanceof Error) {
          setError(err.message || "unknown error");
        } else {
          setError("unknown error");
        }
      } finally {
        setLoading(false);
      }
    }
  }, []);

  if (loading) return <div>Loading...</div>
  if (error) return <div>Errore: {error}. Prova a ricaricare la pagina.</div>

  return <>
    <table>
      <thead>
        <tr>
          <th>cognome</th>
          <th>nome</th>
          <th>classe</th>
          <th>sezione</th>
          <th>data nascita</th>
          <th>scuola</th>
            {tipo_risposte.map((t, i) => <th key={i}>{t.n}</th>)}
          <th>punti</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <tr key={row._id}>
          <td>{row.cognome}</td>
          <td>{row.nome}</td>
          <td>{row.classe}</td>
          <td>{row.sezione}</td>
          <td>{row.data_nascita}</td>
          <td>{row.scuola}</td>
          { tipo_risposte.map((t, i) => 
          <td key={i}> {
            ((t, v) => {
                return v
              })(t, row.risposte[i])
            }
          </td>)}
          <td> ?? </td>
        </tr>)}
        <InputRow />
      </tbody>
    </table>
  </>

  async function fetchData(): Promise<{data?: RowWithId[], error?: string}> {
    const response = await fetch('/api/data')
    if (!response.ok) {
      throw new Error('Failed to fetch data')
    }
    return response.json()
  }
}

function InputRow() {
  const [cognome, setCognome] = useState('')
  const [nome, setNome] = useState('')
  const [classe, setClasse] = useState(-1)
  const [sezione, setSezione] = useState('')
  const [data_nascita, setDataNascita] = useState('')
  const [scuola, setScuola] = useState('')
  const [risposte, setRisposte] = useState(tipo_risposte.map(() => ''))
  const [state, setState] = useState('')
  const [busy, setBusy] = useState(false)

  return <tr>
    <td><Input type="text" value={cognome} setValue={setCognome}/></td>
    <td><Input type="text" value={nome} setValue={setNome}/></td>
    <td><Input type="number" value={classe.toString()} setValue={v => setClasse(parseInt(v))} size={2} width="2em"/></td>
    <td><Input type="text" value={sezione} setValue={setSezione}/></td>
    <td><Input type="date" value={data_nascita} setValue={setDataNascita}/></td>
    <td><Input type="text" value={scuola} setValue={setScuola}/></td>
    { tipo_risposte.map((t, i) => <td key={i}>{
        ((t,v) => {
          switch (t.t) {

            case 'choice': return <ChoiceInput value={v} setValue={setValue}/>
            case 'number': return <NumberInput value={v} setValue={setValue}/>
            case 'score': return <ScoreInput value={v} setValue={setValue}/>
            default:
              return '???'
          }

          function setValue(value: string) {
            setRisposte(r => [...r.slice(0, i), value, ...r.slice(i+1)])
          }

        })(t, risposte[i])
      }
    </td>)}
    <td><button disabled={busy} onClick={save}>salva</button></td>
    <td>{state}</td>
  </tr>

  async function save() {
    setBusy(true)
    try {
      const response = await fetch('/api/insert', {
        method: 'POST',
        body: JSON.stringify({ cognome, nome, risposte }),
      });
  
      if (response.ok) {
        setState('Data saved');
        setBusy(false)
      } else {
        setState('Failed to save data');
        setBusy(false)
      }
    } catch {
      setState('An error occurred while saving data');
      setBusy(false)
    }
  }
}

function ChoiceInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input style={{width: "1.2em"}}type="text" value={value} size={1} onChange={(e) => setValue(e.target.value)} />
}

function NumberInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "3em"}}/>
}

function ScoreInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "2em"}}/>
}

function Input({type, size, value, setValue, width}:{
  type: string, 
  size?: number, 
  value: string, 
  width?: string,
  setValue?: (value: string) => void
}) {
  return <input type={type} width={width} size={size} value={value} onChange={e => setValue && setValue(e.target.value)} />
}

