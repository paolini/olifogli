import { useEffect, useRef } from "react"
import type { ChangeEvent, FocusEvent, KeyboardEvent, RefObject } from "react"
import { Field } from "../lib/schema/fields"

export default function TableRowInput({field, inputRef, value, setValue, oldValue}:{
    field: Field,
    inputRef: RefObject<HTMLInputElement|null>,
    value: string,
    oldValue: string,
    setValue: (newValue: string|undefined) => void
}) {
    const lastValueRef = useRef(value);

    useEffect(() => {
        lastValueRef.current = value;
    }, [value]);

    useEffect(() => {
        // Cleanup allo smontaggio
        return () => {
            const latest = lastValueRef.current;
            if (latest !== undefined) {
                cleanAndSet(latest);
            }
        };
    }, []); // Eseguito solo all’unmount

    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
    />

    function cleanAndSet(value: string) {
        const cleaned = field.clean(value)
        console.log(`Cleaning up value on unmount: ${JSON.stringify({cleaned, oldValue, value})}`);
        setValue(cleaned === oldValue ? undefined : cleaned)
    }

    function onChange(e: ChangeEvent<HTMLInputElement>) {
        const value = e.currentTarget.value
        setValue(value === oldValue ? undefined : value)
    }

    function onBlur(e: FocusEvent<HTMLInputElement>) {
        cleanAndSet(e.currentTarget.value)
    }

    function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter" || e.key === "Escape" 
            || e.key === "Tab" || e.key=== "ArrowUp" 
            || e.key === "ArrowDown") {
            e.preventDefault()
            return
        }
        const input = e.target as HTMLInputElement
        const cursorPos = input.selectionStart || 0
        const cursorEnd = input.selectionEnd || 0
        const isAtStart = cursorPos === 0 && cursorEnd === 0
        const isAtEnd = cursorPos === input.value.length && cursorEnd === input.value.length
      
        if ((e.key === "ArrowLeft" && isAtStart)
            || (e.key === "ArrowRight" && isAtEnd)) {
            // fai gestire il movimento di focus alla tabella
            e.preventDefault()
            return
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            // evita che le componenti superiori intercettino l'evento
            e.stopPropagation() 
        } else if (field.type === 'date') {
            const newValue = dateKeyDownHandler(e.key, input)
            if (newValue !== undefined) {
                e.preventDefault()
                setValue(newValue === oldValue ? undefined : newValue)
                return
            }
        }
    }
}

function dateKeyDownHandler(key: string, input: HTMLInputElement):string|undefined {
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

      // Imposta la posizione del cursore
      setTimeout(() => {
        const input = document.activeElement as HTMLInputElement
        if (input) {
          input.setSelectionRange(cursorPos, cursorPos)
        }
      }, 0)
      return value
    }
    return undefined
}
