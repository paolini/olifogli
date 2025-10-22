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
    case 'DateInput': return <DateInput value={value} setValue={setValue} onEnter={onEnter}/>
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

export function DateInput({type, size, value, setValue, width, onEnter}:{
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
    onChange={onChange} 
    onKeyDown={onKeyDown}
    onBlur={onBlur}
    style={{ padding: '1px 1px' }} // Add padding for better UX
  />

  function normalize(value: string): string {
    // rimpiazza tutti i caratteri non numerici con /
    value = value.split('').map(c => (c >= '0' && c <= '9' ? c : '/')).join('')

    // rimpiazza doppie barre con una sola barra
    value = value.replace(/\/+/g, '/')

    // aggiunge padding di 0 se ci sono meno di due cifre
    const parts = value.split('/').map((part, index) =>
      (part.length === 1 && (index < 2)) 
        ? '0' + part 
        : part)

    // aggiunge secolo 20 se ho tre elementi e il terzo ha due cifre
    if (parts.length === 3 && 2===parts[2].length) {
      parts[2] = '20' + parts[2]
    }

    // aggiunge 200 se l'anno ha una sola cifra
    if (parts.length === 3 && 1 === parts[2].length) {
      parts[2] = '200' + parts[2]
    }

    value = parts.join('/')
    return value
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!setValue) return
    setValue(e.target.value)
//    setValue(normalize(e.target.value))
  }

  function onBlur() {
    if (!setValue) return
    const originalValue = value
    value = normalize(originalValue)

    if (value!==originalValue) {
      setValue(value)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") {
      onEnter()
      return
    }

    if (!setValue) return

    const input = e.target as HTMLInputElement

    let key = e.key
    if (key === ' ') key = '/'

    if (key >= '0' && key <= '9' || key === '/') {      
      let cursorPos = input.selectionStart || 0
      const cursorEnd = input.selectionEnd || 0
      let value = input.value
      // rimpiazza eventuali '|' con '/'
      value = value.replace(/\|/g, '/')

      // inserisci carattere e '|' come cursore
      value = input.value.slice(0, cursorPos) + key + '|' + input.value.slice(cursorEnd)

      // sostituisci eventuali doppie barre con una sola barra
      value = value.replace(/\/+/g, '/')
      value = value.replace(/\/\|\//g, '/|')

      // Aggiungi una barra se value = "gg|" o "gg/mm|"
      if (value.match(/^\d{2}\|$/) || value.match(/^\d{2}\/\d{2}\|$/) ) {
        value = value.replace('|', '/|')
      }

      cursorPos = value.indexOf('|')
      value = value.replace('|', '')

      // Aggiorna il valore e il cursors
      setValue(value)

      // Imposta la posizione del cursore
      setTimeout(() => {
        const input = document.activeElement as HTMLInputElement
        if (input) {
          input.setSelectionRange(cursorPos, cursorPos)
        }
      }, 0)

      // Previeni l'inserimento normale
      e.preventDefault()
    }
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
