import { KeyboardEvent } from "react"
import { Field } from "../lib/schema"

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
    default: return <span>[invalid widget "{field.widget}"]</span>
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
  return <input type={type} width={width} size={size} value={value} onChange={e => setValue && setValue(e.target.value)} onKeyDown={onKeyDown} />

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
  }
}

export function ChoiceInput({value, setValue, onEnter}:{
  value: string, 
  setValue: (value: string) => void,
  onEnter?: () => void,
  }) {
  return <input style={{width: "1.2em", textAlign:"center"}}type="text" value={value} size={1} onChange={onChange} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
  }

  function clean(value: string) {
    if (value.length === 0) return ''
    value = value.slice(-1) // last char
    value = value.toUpperCase()
    if (!"ABCDE-X".includes(value.toUpperCase())) return ''
    return value
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = clean(e.target.value)
    setValue(value)
    if (value.length>0) {
      const td = e.target.closest("td"); // Trova la cella <td> in cui si trova l'input
      const next_td = td?.nextElementSibling; // Trova la cella successiva
      const next_input = next_td?.querySelector("input"); // Trova l'input nella cella successiva
      if (next_input) (next_input as HTMLElement).focus();
    }
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
