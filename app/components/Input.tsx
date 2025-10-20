"use client"
import type { KeyboardEvent } from "react"
import { Field } from "../lib/schema/fields"

export function InputCell({field, value, setValue, onEnter}: {
  field: Field,
  value: string,
  setValue: ((value: string) => void),
  onEnter?: () => void,
}) {
  switch(field.widget) {
    case 'ChoiceInput': return <ChoiceInput value={value} setValue={setValue} onEnter={onEnter}/>
    case 'NumericInput': return <NumericInput value={value} setValue={setValue} onEnter={onEnter}/>
    case 'ScoreInput': return <ScoreInput value={value} setValue={setValue} onEnter={onEnter}/>
    case 'Input': return <Input value={value} setValue={setValue} onEnter={onEnter}/>
    default: return <span>[invalid widget {field.widget}]</span>
  }
}

export function Input({type, size, value, setValue, width, onEnter}:{
  type?: string,
  size?: number,
  value: string,
  width?: string,
  setValue?: (value: string) => void,
  onEnter?: () => void,
}) {
  return <input 
    type={type} 
    width={width} 
    size={size} 
    value={value} 
    onChange={e => setValue && setValue(e.target.value)} 
    onKeyDown={onKeyDown}
    style={{ padding: '1px 1px' }} // Add padding for better UX
  />

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
  }
}

export function ChoiceInput({value, setValue, onEnter}:{
  value: string, 
  setValue: (value: string) => void,
  onEnter?: () => void,
  }) {
  return <input style={{width: "1.2em", textAlign:"center"}} type="text" value={value?value.charAt(0):''} size={1} onChange={onChange} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") {
      onEnter()
    } else if (e.key === "Delete") {
      e.preventDefault()
      setValue('')
    } else if (e.key === "Backspace") {
      const td = (e.target as HTMLInputElement).closest("td");
      const prev_td = td?.previousElementSibling;
      const prev_input = prev_td?.querySelector("input");
      if (prev_input) {
        console.log("qui")
        e.preventDefault();
        (prev_input as HTMLElement).focus();
      }
      if (prev_input?.value?.length && prev_input.classList.contains('field-ChoiceField')) {
        e.preventDefault();
        prev_input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      }
    } else if (e.key.length === 1) {
      // Se è un singolo carattere (non un tasto speciale come Shift, Ctrl, etc.)
      let  char = e.key.toUpperCase()
      if (! "ABCDEX-".includes(char)) char = 'X'
      e.preventDefault() // Previeni l'inserimento normale
      setValue(char) // Sostituisci il valore

      // Passa al campo successivo
      const td = (e.target as HTMLInputElement).closest("td");
      const next_td = td?.nextElementSibling;
      const next_input = next_td?.querySelector("input");
      if (next_input) (next_input as HTMLElement).focus();
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    // onChange non è più necessario per la logica, ma lo manteniamo come fallback
  }
}

export function NumericInput({value, setValue, onEnter}: {
  value: string, 
  setValue: (value: string) => void,
  onEnter?: () => void,
}) {
  return <input value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "3em"}} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
  }
}

export function ScoreInput({value, setValue, onEnter}: {
    value: string, 
    setValue: (value: string) => void,
    onEnter?: () => void,
  }) {
  return <input value={value} size={2} onChange={(e) => setValue(e.target.value)} style={{width: "2em"}} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
  }
}
