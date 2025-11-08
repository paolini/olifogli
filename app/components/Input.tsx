"use client"
import type { KeyboardEvent, Ref } from "react"
import { Field } from "../lib/schema/fields"
/*
export function InputCell({field, value, setValue, onEnter, onEscape, onArrowNavigation, inputRef}: {
  field: Field,
  value: string,
  setValue: ((value: string) => void),
  onEnter?: () => void,
  onEscape?: () => void,
  onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
  inputRef?: Ref<HTMLInputElement>,
}) {
  switch(field.widget) {
    case 'ChoiceInput': return <ChoiceInput value={value} setValue={setValue} onEnter={onEnter} onEscape={onEscape} onArrowNavigation={onArrowNavigation} inputRef={inputRef}/>
    case 'NumericInput': return <NumericInput value={value} setValue={setValue} onEnter={onEnter} onEscape={onEscape} onArrowNavigation={onArrowNavigation} inputRef={inputRef}/>
    case 'ScoreInput': return <ScoreInput value={value} setValue={setValue} onEnter={onEnter} onEscape={onEscape} onArrowNavigation={onArrowNavigation} inputRef={inputRef}/>
    case 'Input': return <Input value={value} setValue={setValue} onEnter={onEnter} onEscape={onEscape} onArrowNavigation={onArrowNavigation} inputRef={inputRef}/>
    case 'DateInput': return <DateInput value={value} setValue={setValue} onEnter={onEnter} onEscape={onEscape} onArrowNavigation={onArrowNavigation} inputRef={inputRef}/>
    default: return <span>[invalid widget {field.widget}]</span>
  }
}

export function Input({type, size, value, setValue, width, onEnter, onEscape, onArrowNavigation, inputRef}:{
  type?: string,
  size?: number,
  value: string,
  width?: string,
  setValue?: (value: string) => void,
  onEnter?: () => void,
  onEscape?: () => void,
  onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
  inputRef?: Ref<HTMLInputElement>,
}) {
  return <input 
    ref={inputRef}
    type={type} 
    width={width} 
    size={size} 
    value={value} 
    onChange={e => setValue && setValue(e.target.value)} 
    onKeyDown={onKeyDown}
    style={{ padding: '1px 1px' }} // Add padding for better UX
  />
}

export function DateInput({type, size, value, setValue, width, onEnter, onEscape, onArrowNavigation, inputRef}:{
  type?: string,
  size?: number,
  value: string,
  width?: string,
  setValue?: (value: string) => void,
  onEnter?: () => void,
  onEscape?: () => void,
  onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
  inputRef?: Ref<HTMLInputElement>,
}) {
  return <input 
    ref={inputRef}
    type={type} 
    width={width} 
    size={size} 
    value={value} 
    onChange={onChange} 
    onKeyDown={onKeyDown}
    onBlur={onBlur}
    style={{ padding: '1px 1px' }} // Add padding for better UX
  />



  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") {
      onEnter()
      return
    }

    if (onEscape && e.key === "Escape") {
      e.preventDefault()
      onEscape()
      return
    }

    // Gestione navigazione con frecce
    if (onArrowNavigation) {
      const input = e.target as HTMLInputElement
      const cursorPos = input.selectionStart || 0
      const cursorEnd = input.selectionEnd || 0
      const isAtStart = cursorPos === 0 && cursorEnd === 0
      const isAtEnd = cursorPos === input.value.length && cursorEnd === input.value.length
      
      if (e.key === "ArrowLeft" && isAtStart) {
        e.preventDefault()
        onArrowNavigation('left', true)
        return
      } else if (e.key === "ArrowRight" && isAtEnd) {
        e.preventDefault()
        onArrowNavigation('right', true)
        return
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        onArrowNavigation('up', true)
        return
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        onArrowNavigation('down', true)
        return
      }
    }

    if (!setValue) return

    const input = e.target as HTMLInputElement

    let key = e.key
    if (key === ' ' || key==='.') key = '/'

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

export function ChoiceInput({value, setValue, onEnter, onEscape, onArrowNavigation, inputRef}:{
  value: string, 
  setValue: (value: string) => void,
  onEnter?: () => void,
  onEscape?: () => void,
  onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
  inputRef?: Ref<HTMLInputElement>,
  }) {
  return <input ref={inputRef} style={{width: "2ex", textAlign:"center"}} type="text" value={value?value.charAt(0):''} size={1} onChange={onChange} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") {
      onEnter()
    } else if (onEscape && e.key === "Escape") {
      e.preventDefault()
      onEscape()
    } else if (onArrowNavigation && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault()
      if (e.key === "ArrowLeft") onArrowNavigation('left', true)
      else if (e.key === "ArrowRight") onArrowNavigation('right', true)
      else if (e.key === "ArrowUp") onArrowNavigation('up', true)
      else if (e.key === "ArrowDown") onArrowNavigation('down', true)
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
      if (char === '0') char = '-'
      else if (char === '1') char = 'A'
      else if (char === '2') char = 'B'
      else if (char === '3') char = 'C'
      else if (char === '4') char = 'D'
      else if (char === '5') char = 'E'
      else if (char === '6') char = 'X'
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

export function NumericInput({value, setValue, onEnter, onEscape, onArrowNavigation, inputRef}: {
  value: string, 
  setValue: (value: string) => void,
  onEnter?: () => void,
  onEscape?: () => void,
  onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
  inputRef?: Ref<HTMLInputElement>,
}) {
  return <input ref={inputRef} value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "3em"}} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
    if (onEscape && e.key === "Escape") {
      e.preventDefault()
      onEscape()
    }
    
    if (onArrowNavigation) {
      const input = e.target as HTMLInputElement
      const cursorPos = input.selectionStart || 0
      const cursorEnd = input.selectionEnd || 0
      const isAtStart = cursorPos === 0 && cursorEnd === 0
      const isAtEnd = cursorPos === input.value.length && cursorEnd === input.value.length
      
      if (e.key === "ArrowLeft" && isAtStart) {
        e.preventDefault()
        onArrowNavigation('left', true)
      } else if (e.key === "ArrowRight" && isAtEnd) {
        e.preventDefault()
        onArrowNavigation('right', true)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        onArrowNavigation('up', true)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        onArrowNavigation('down', true)
      }
    }
  }
}

export function ScoreInput({value, setValue, onEnter, onEscape, onArrowNavigation, inputRef}: {
    value: string, 
    setValue: (value: string) => void,
    onEnter?: () => void,
    onEscape?: () => void,
    onArrowNavigation?: (direction: 'left' | 'right' | 'up' | 'down', cursorAtEdge: boolean) => void,
    inputRef?: Ref<HTMLInputElement>,
  }) {
  return <input ref={inputRef} value={value} size={2} onChange={(e) => setValue(e.target.value)} style={{width: "2em"}} onKeyDown={onKeyDown}/>

  function onKeyDown(e:KeyboardEvent<HTMLInputElement>) {
    if (onEnter && e.key === "Enter") onEnter()
    if (onEscape && e.key === "Escape") {
      e.preventDefault()
      onEscape()
    }
    
    if (onArrowNavigation) {
      const input = e.target as HTMLInputElement
      const cursorPos = input.selectionStart || 0
      const cursorEnd = input.selectionEnd || 0
      const isAtStart = cursorPos === 0 && cursorEnd === 0
      const isAtEnd = cursorPos === input.value.length && cursorEnd === input.value.length
      
      if (e.key === "ArrowLeft" && isAtStart) {
        e.preventDefault()
        onArrowNavigation('left', true)
      } else if (e.key === "ArrowRight" && isAtEnd) {
        e.preventDefault()
        onArrowNavigation('right', true)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        onArrowNavigation('up', true)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        onArrowNavigation('down', true)
      }
    }
  }
}
  */
