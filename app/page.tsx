"use client"
import { useState } from 'react'

export default function Home() {
  return <Table></Table>
}

function Table() {
  return <>
    <table>
      <thead>
        <tr>
          <th>cognome</th>
          <th>nome</th>
          <th>risposte</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Row 1 Data 1</td>
          <td>Row 1 Data 2</td>
        </tr>
        <tr>
          <td>Row 2 Data 1</td>
          <td>Row 2 Data 2</td>
        </tr>
        <InputRow />
      </tbody>
    </table>
  </>
}

function InputRow() {
  const [cognome, setCognome] = useState('')
  const [nome, setNome] = useState('')
  const [risposte, setRisposte] = useState('')
  const [state, setState] = useState('')

  return <tr>
    <td><Input type="text" value={cognome} setValue={setCognome}/></td>
    <td><Input type="text" value={nome} setValue={setNome}/></td>
    <td><Input type="text" value={risposte} setValue={setRisposte} size={5}/></td>
    <td><button onClick={save}>salva</button></td>
    <td>{state}</td>
  </tr>

  function save() {
    fetch('/api/insert', {
      method: 'POST',
      body: JSON.stringify({ cognome, nome, risposte })
    }).then(response => {
      if (response.ok) {
        setState('Data saved')
      } else {
        setState('Failed to save data')
      }
    })
  }
}

function Input({type, size, value, setValue}:{
  type: string, 
  size?: number, 
  value: string, 
  setValue?: (value: string) => void
}) {
  return <input type={type} size={size} value={value} onChange={e => setValue && setValue(e.target.value)} />
}