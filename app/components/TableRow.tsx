import { WithId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { ChoiceAnswerField, Field } from '@/app/lib/schema/fields'

import { Row } from '@/app/graphql/generated'
import { myTimestamp } from '../lib/util'

export default function TableRow({schema, row, onCellClick, showStandardAnswers, showAdditionalColumns, showHiddenColumns, isSelected, onToggleSelect}: {
  schema: Schema,
  row: WithId<Row>,
  onCellClick?: (fieldName: string) => void,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean,
  showHiddenColumns: boolean,
  isSelected?: boolean,
  onToggleSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  // Calcola quanto tempo è passato dall'ultimo aggiornamento
  const timeSinceUpdate = row.updatedOn ? Date.now() - new Date(row.updatedOn).getTime() : Infinity
  const isRecent = timeSinceUpdate < 60000
  const elapsedTime = isRecent ? timeSinceUpdate / 1000 : 0 // tempo già trascorso in secondi
  
  const className = `clickable${isRecent ? " recently-added" : ""}`
  const style = isRecent ? { 
    '--fade-delay': `-${elapsedTime}s` 
  } as React.CSSProperties : undefined

  const columns = schema.fields.filter(f => !f.hidden || showHiddenColumns);
  
  return <tr className={className} style={style}>
    <td className="checkbox-cell">
      <input 
        type="checkbox" 
        checked={isSelected || false}
        onChange={onToggleSelect}
      />
    </td>
    { showAdditionalColumns && <TableInfoCells row={row} />}
    {columns.map(field => <TableCell key={field.name} field={field} value={row.data[field.name]} showStandardAnswers={showStandardAnswers} onClick={() => onCellClick && onCellClick(field.name)} />)}
    {(row.error || row?.olimanager?.error) && <td className="alert">{row.error || row?.olimanager?.error}</td>}
    {(row?.olimanager?.participantId) && <td className="olimanager-participant-id">oli={row.olimanager.participantId} sync={row.olimanager.resultsUpdatedOn?"1":"0"}</td>}
  </tr>
}

export function TableInfoCells({row}: {
  row: WithId<Row>|undefined
}) {
  const modified = row?.updatedOn && row?.updatedOn !== row?.createdOn
  return <>
    <td className="createdOn">{row?.createdOn && myTimestamp(row.createdOn)}</td>
    <td className="createdBy">{row?.createdBy || ''}</td> 
    <td className="updatedOn">{modified && myTimestamp(row.updatedOn)}</td>
    <td className="updatedBy">{modified && row?.updatedBy || ''}</td>
  </>
}

export function TableCell({field, value, showStandardAnswers, onClick}:{
  field: Field,
  value: string,
  showStandardAnswers?: boolean,
  onClick?: () => void
}) {
  let extra_css="";
  let correct_value = undefined;
  let title = value;
  if (field instanceof ChoiceAnswerField) {
    if (value.length === 7) {
      // showStandardAnswers decides whether to show 
      // the corresponding answers in the standard permutation (211/311)
      correct_value = showStandardAnswers ? value.charAt(5) : value.charAt(3)
      value = showStandardAnswers ? value.charAt(4) : value.charAt(0);
      extra_css = value === correct_value
        ? "correct"
        : value === '-' 
          ? "empty" 
            : ["A", "B", "C", "D", "E"].includes(value) 
              ? "incorrect" 
              : "invalid";
      title = value === correct_value ? value : `${value} (invece di ${correct_value})`;
    }
  }
  if (showStandardAnswers &&field.name === 'variant') {
    if (value.length === 3) {
      value = `›${value.charAt(0)}11‹` 
    }
  }

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  return <td key={field.name} title={title} className={`${field.css_class} ${extra_css}`} onClick={onClick} style={style}>
      {value}
  </td>
}

