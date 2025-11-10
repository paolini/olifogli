import { useEffect, useRef } from "react"
import type { ChangeEvent, FocusEvent, KeyboardEvent, RefObject } from "react"
import { Field } from "../lib/schema/fields"

export default function TableRowInput({field, value, setValue, oldValue, moveLeft, moveRight}:{
    field: Field,
    value: string,
    oldValue: string,
    setValue: (newValue: string|undefined) => void
    moveLeft: () => boolean,
    moveRight: () => boolean,
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const lastValueRef = useRef(value);

    useEffect(() => {
        const input = inputRef.current
        if (input) {
            input.focus()
            input.select()
        }
    }, [inputRef])

    useEffect(() => {
        lastValueRef.current = value;
    }, [value]);

    useEffect(() => {
        // Cleanup allo smontaggio
        return () => {
            const latest = lastValueRef.current;
            if (latest !== undefined) {
                const cleaned = field.clean(latest)
                console.log(`TableRowInput unmounting, cleaning up value: ${latest} -> ${cleaned}`);
                setValue(cleaned === oldValue ? undefined : cleaned)
            }
        };
    }, [field, oldValue, setValue]); // RIMOSSO setValue dalle dipendenze

    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
    />

    function onFocus(e: FocusEvent<HTMLInputElement>) {
        if (field.type === 'choice-answer') {
            e.target.select()
        }
    }

    function cleanAndSet(value: string) {
        const cleaned = field.clean(value)
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

        if (field.type === 'choice-answer') {
            const newValue = choiceAnswerKeyDownHandler(e, input, moveLeft, moveRight);
            if (newValue !== undefined) {
                e.preventDefault()
                setValue(newValue === oldValue ? undefined : newValue)
                return
            }
        } else if ((e.key === "ArrowLeft" && isAtStart)
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

function choiceAnswerKeyDownHandler(e: KeyboardEvent<HTMLInputElement>, input: HTMLInputElement, moveLeft: () => boolean, moveRight: () => boolean):string|undefined {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // lascia che il movimento venga gestito da TableRow
        e.preventDefault()
        return 
    } else if (e.key === "Delete") {
        return ''
    } else if (e.key === "Backspace") {
        setTimeout(() => moveLeft(),0)
        return ''
    } else if (e.key.length === 1) {
        // Se è un singolo carattere (non un tasto speciale come Shift, Ctrl, etc.)
        let char = e.key.toUpperCase()
        if (char === '0') char = '-'
        else if (char === '1') char = 'A'
        else if (char === '2') char = 'B'
        else if (char === '3') char = 'C'
        else if (char === '4') char = 'D'
        else if (char === '5') char = 'E'
        else if (char === '6') char = 'X'
        if (! "ABCDEX-".includes(char)) char = 'X'
        setTimeout(() => moveRight(), 0);      
        return char // Sostituisci il valore
    } else {
        return undefined;
    }
}