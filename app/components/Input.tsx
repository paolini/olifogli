export function Input({type, size, value, setValue, width}:{
  type?: string, 
  size?: number, 
  value: string, 
  width?: string,
  setValue?: (value: string) => void
}) {
  return <input type={type} width={width} size={size} value={value} onChange={e => setValue && setValue(e.target.value)} />
}

export function ChoiceInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input style={{width: "1.2em", textAlign:"center"}}type="text" value={value} size={1} onChange={onChange} />

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

export function NumberInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={4} onChange={(e) => setValue(e.target.value)} style={{width: "3em"}}/>
}

export function ScoreInput({value, setValue}: {
  value: string, 
  setValue: (value: string) => void}) {
  return <input type="number" value={value} size={2} onChange={(e) => setValue(e.target.value)} style={{width: "2em"}}/>
}
