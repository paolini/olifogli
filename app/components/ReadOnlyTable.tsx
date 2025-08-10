import { memo } from 'react'
import { WithId, ObjectId } from 'mongodb'
import Schema from '@/app/lib/schema/Schema'
import { Field } from '@/app/lib/schema/fields'

import { Row, Sheet } from '@/app/lib/models'

export default function ReadOnlyTable({rows, onRowClick, selectedRowId, schema}: {
  rows: Row[],
  onRowClick: (row: WithId<Row>) => void,
  selectedRowId: ObjectId | null,
  schema: Schema,
}) {
  return (
    <table className="readonly-table">
      <thead>
        <tr>
          {schema.fields.map(field => 
            <th scope="col" key={field.name} className={field.css_style}>
              {field.header}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <ReadOnlyRow 
            key={row._id.toString()} 
            row={row}
            schema={schema}
            isSelected={row._id === selectedRowId}
            onClick={() => onRowClick(row)}
          />
        ))} 
      </tbody>
    </table>
  )
}

const ReadOnlyRow = memo(ReadOnlyRowInternal)

function ReadOnlyRowInternal({row, schema, isSelected, onClick}: {
  row: WithId<Row>,
  schema: Schema,
  isSelected: boolean,
  onClick: () => void
}) {
  const className = `clickable${row.isValid ? "" : " alert"}${isSelected ? " selected" : ""}`

  return (
    <tr className={className} onClick={onClick}>
      {schema.fields.map(field => (
        <ReadOnlyCell 
          key={field.name} 
          field={field} 
          value={row.data[field.name]} 
        />
      ))}
    </tr>
  )
}

function ReadOnlyCell({field, value}: {
  field: Field,
  value: string,
}) {
  return (
    <td key={field.name} className={field.css_style}>
      {value}
    </td>
  )
}
