import { useEffect, useRef } from "react"
import type { ChangeEvent, FocusEvent } from "react"
import { Field } from "../lib/schema/fields"

export default function TableRowInput({field, value, setValue, oldValue, cellKeyDown}:{
    field: Field,
    value: string,
    oldValue: string,
    setValue: (newValue: string|undefined) => void
    cellKeyDown: (key: string, input: HTMLInputElement, preventDefault: () => void, stopPropagation: () => void) => void,
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const lastValueRef = useRef(value);

    useEffect(() => {
        const input = inputRef.current
        if (input) {
            input.focus()
            //input.select()
        }
    }, [inputRef])

    useEffect(() => {
        lastValueRef.current = value;
    }, [value]);

    /*
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
    */

    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={e => cellKeyDown(e.key, e.currentTarget, () => e.preventDefault(), () => e.stopPropagation())}
        onFocus={onFocus}
    />

    function onFocus(e: FocusEvent<HTMLInputElement>) {
        console.log(`TableRowInput onFocus for field ${field.name}`);
        if (field.type === 'choice-answer') {
            e.target.select()
        }
    }

    function cleanAndSet(value: string) {
        console.log(`TableRowInput cleanAndSet for field ${field.name} with value: ${value}`);
        const cleaned = field.clean(value)
        setValue(cleaned === oldValue ? undefined : cleaned)
    }

    function onChange(e: ChangeEvent<HTMLInputElement>) {
        console.log(`TableRowInput onChange for field ${field.name} with value: ${e.currentTarget.value}`);
        const value = e.currentTarget.value
        setValue(value === oldValue ? undefined : value)
    }

    function onBlur(e: FocusEvent<HTMLInputElement>) {
        console.log(`TableRowInput onBlur for field ${field.name} with value: ${e.currentTarget.value}`);
        cleanAndSet(e.currentTarget.value)
    }
}