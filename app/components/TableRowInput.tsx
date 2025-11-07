export default function TableRowInput({inputRef, value, setValue}:{
    inputRef: React.RefObject<HTMLInputElement|null>,
    value: string,
    setValue: (newValue: string) => void
}) {
    return <input                       
        className="table-row" 
        ref={inputRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
    />

    function onChange(e: React.ChangeEvent<HTMLInputElement>) {
        setValue(e.currentTarget.value)
    }

    function onBlur(e: React.FocusEvent<HTMLInputElement>) {
        // gestito da TableInputRowOld
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        }
    }
}