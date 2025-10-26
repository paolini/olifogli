import { useState, memo, useEffect, useRef } from 'react'
import { WithId, ObjectId } from 'mongodb'
import { useMutation, StoreObject, gql } from '@apollo/client'
import Schema from '@/app/lib/schema/Schema'
import { ChoiceAnswerField, Field } from '@/app/lib/schema/fields'

import { InputCell } from '@/app/components/Input'
import { Data } from '@/app/lib/models'
import { Row, Sheet } from '@/app/graphql/generated'
import { myTimestamp } from '../lib/util'

export default function TableInner({rows, currentRowId, setCurrentRowId, sheet, schema, showStandardAnswers, showAdditionalColumns}: {
  rows: Row[],
  currentRowId: ObjectId|null,
  setCurrentRowId: (id: ObjectId|null) => void,
  sheet: Sheet,
  schema: Schema,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  const columns = schema.fields.filter(f => !f.hidden);

  return <table className="my-table">
    <colgroup>
      { showAdditionalColumns && <>
        <col className="createdOn" />
        <col className="createdBy" />
        <col className="updatedOn" /> 
        <col className="updatedBy" />
      </>}
      {columns.map(field => <col key={field.name} className={field.css_class} />)}
      <col className="actions-cell" />
    </colgroup>
    <thead>
      <tr>
        { showAdditionalColumns && <>
          <th scope="col" className="createdOn">istante creazione</th>
          <th scope="col" className="createdBy">creato da</th>
          <th scope="col" className="updatedOn">istante modifica</th>
          <th scope="col" className="updatedBy">aggiornato da</th>
        </>}
        {columns.map(field => 
          <th scope="col" key={field.name} className={field.css_class}>
            {field.header}
          </th>)}
        <th scope="col" className="actions-cell"></th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => 
        <MyRow key={row._id.toString()} current={row._id === currentRowId} sheetId={sheet._id.toString()} schema={schema} row={row} setCurrentRowId={setCurrentRowId} showStandardAnswers={showStandardAnswers} showAdditionalColumns={showAdditionalColumns} />)} 
      {currentRowId 
        ? <tr><td colSpan={schema.fields.length}><button className="bg-alert" onClick={() => setCurrentRowId(null)}>
          aggiungi riga
          </button></td></tr>
        : <InputRow sheetId={sheet._id.toString()} schema={schema} showAdditionalColumns={showAdditionalColumns} />}
    </tbody>
  </table>
}
  
const MyRow = memo(MyRowInternal)

function MyRowInternal({current, sheetId, schema, row, setCurrentRowId, showStandardAnswers, showAdditionalColumns}: {
  current: boolean,
  sheetId: string,
  schema: Schema,
  row: WithId<Row>,
  setCurrentRowId: (id: ObjectId|null) => void,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  const [focusFieldName, setFocusFieldName] = useState<string|null>(null)
  
  if (current) return <InputRow sheetId={sheetId} schema={schema} row={row} done={() => setCurrentRowId(null)} showAdditionalColumns={showAdditionalColumns} focusFieldName={focusFieldName} />
  else return <TableRow schema={schema} row={row} onCellClick={(fieldName) => {
    setCurrentRowId(row._id)
    setFocusFieldName(fieldName)
  }} showStandardAnswers={showStandardAnswers} showAdditionalColumns={showAdditionalColumns} />
}

function TableRow({schema, row, onCellClick, showStandardAnswers, showAdditionalColumns}: {
  schema: Schema,
  row: WithId<Row>,
  onCellClick?: (fieldName: string) => void,
  showStandardAnswers: boolean,
  showAdditionalColumns: boolean
}) {
  // Calcola quanto tempo è passato dall'ultimo aggiornamento
  const timeSinceUpdate = row.updatedOn ? Date.now() - new Date(row.updatedOn).getTime() : Infinity
  const isRecent = timeSinceUpdate < 60000
  const elapsedTime = isRecent ? timeSinceUpdate / 1000 : 0 // tempo già trascorso in secondi
  
  const className = `clickable${isRecent ? " recently-added" : ""}`
  const style = isRecent ? { 
    '--fade-delay': `-${elapsedTime}s` 
  } as React.CSSProperties : undefined

  const columns = schema.fields.filter(f => !f.hidden);
  
  return <tr className={className} style={style}>
    { showAdditionalColumns && <TableInfoCells row={row} />}
    {columns.map(field => <TableCell key={field.name} field={field} value={row.data[field.name]} showStandardAnswers={showStandardAnswers} onClick={() => onCellClick && onCellClick(field.name)} />)}
    {row.error && <td className="alert">{row.error}</td>}
  </tr>
}

function TableInfoCells({row}: {
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

function TableCell({field, value, showStandardAnswers, onClick}:{
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

  const style = typeof field.css_style === 'function' 
    ? field.css_style(value) 
    : field.css_style;

  return <td key={field.name} title={title} className={`${field.css_class} ${extra_css}`} onClick={onClick} style={style}>
      {value}
  </td>
}

function InputRow({sheetId, schema, row, done, showAdditionalColumns, focusFieldName}: {
  sheetId: string,
  schema: Schema, 
  row?: WithId<Row>,
  done?: () => void,
  showAdditionalColumns: boolean,
  focusFieldName?: string|null
}) {
  const [addRow, {loading: addLoading, error: addError, reset: addReset}] = useAddRow()
  const [patchRow, {loading: patchLoading, error: patchError, reset: patchReset}] = usePatchRow()
  const [deleteRow, {loading: deleteLoading, error: deleteError, reset: deleteReset}] = useDeleteRow() 
  const columns = schema.fields.filter(f => !f.hidden);
  const [fields, setFields] = useState<Data>(Object.fromEntries(columns.map(f => [f.name, row?.data[f.name] || ''])))
  const [cacheUpdatedOn] = useState(row?.updatedOn) // controllo se la riga mi cambia sotto i piedi
  const firstInputRef = useRef<HTMLInputElement>(null)
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  
  const loading = addLoading || patchLoading || deleteLoading
  const error = addError || patchError || deleteError
  const modified = hasBeenModified()

  // Mette il focus sul primo input quando viene creata una nuova riga
  useEffect(() => {
    if (!row && !loading && firstInputRef.current) {
      firstInputRef.current.focus()
    }
  }, [row, loading])

  // Mette il focus sul campo cliccato quando si modifica una riga esistente
  useEffect(() => {
    if (row && focusFieldName && fieldRefs.current[focusFieldName]) {
      fieldRefs.current[focusFieldName]?.focus()
    }
  }, [row, focusFieldName])

  // Controlla se la riga è stata modificata da un altro utente
  useEffect(() => {
    if (cacheUpdatedOn && row && row.updatedOn !== cacheUpdatedOn) {
      if (loading) return // evita di mostrare l'alert se stiamo salvando noi stessi
      alert("la riga che stai modificando è stata aggiornata da un altro utente. Per non creare conflitti devo annullare le tue modifiche.")
      if (done) done()
    }
  }, [cacheUpdatedOn, row, done, loading])

  if (loading) return <tr><td>...</td></tr>
  if (error) return <tr className="error" onClick={dismissError}><td colSpan={columns.length}>Errore: {error.message}</td><td></td></tr>

  return <tr className={modified ? "modified": ""}>
    {showAdditionalColumns && <TableInfoCells row={row} />}
    {columns.map((field, index) => {
      const isFirstEditable = field.editable && columns.slice(0, index).every(f => !f.editable)
      return field.editable
        ? <td key={field.name} className={field.css_class + (fieldHasBeenModified(field.name) ? " modified" : "")}>
          <InputCell
            field={field}
            value={fields[field.name]||''} 
            setValue={v => setFields(fields => ({...fields, [field.name]: v}))}
            onEnter={save}
            inputRef={(el) => {
              if (isFirstEditable) {
                firstInputRef.current = el
              }
              fieldRefs.current[field.name] = el
            }}
          />
        </td>
        : <TableCell key={field.name} field={field} value={fields[field.name]||''} />
    })}
    <td className="actions-cell">
      <button className="bg-green-60" disabled={loading} onClick={save}>
        salva
      </button>
      {row?._id && <button className="ml-1 bg-error" disabled={loading} onClick={deleteFunction}>
        elimina
      </button>}
    </td>
  </tr>

  function fieldHasBeenModified(fieldName: string) {
    if (!row && fields[fieldName] !== '') return true;
    if (row && fields[fieldName] !== row.data[fieldName]) return true;
    return false;
  }

  function hasBeenModified() {
    return columns.some(field => fieldHasBeenModified(field.name));
  }

  function dismissError() {
    if (addError) return addReset()
    if (patchError) return patchReset()
    if (deleteError) return deleteReset()
  }

  async function save() {
    if (row?._id) {
      // patch
      await patchRow({variables: {
        _id: row._id,
        data: fields,
        updatedOn: row.updatedOn || new Date(),
      }})
    } else {
      // insert
      await addRow({variables: {
        sheetId,
        data: fields,
      }})
      setFields(fields => Object.fromEntries(
        Object.entries(fields)
        .map(([key, value]) => schema.fields_to_be_copied_on_new_row.includes(key)
            ? [key, value]
            : [key, '']
      )))
    }
    if (done) done()
  }

  async function deleteFunction() {
    if (!row?._id) throw new Error("cannot delete a row which was not saved")
    await deleteRow({variables: { _id: row._id }})
  }
}

export const ADD_ROW = gql`
  mutation addRow($sheetId: ObjectId!, $data: Data!) {
    addRow(sheetId: $sheetId, data: $data) {
      _id
      error
      data
      createdOn
      createdBy
      updatedOn
      updatedBy
    }
  }
`

const PATCH_ROW = gql`
  mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!) {
    patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
      _id
      __typename
      createdOn
      createdBy
      updatedOn
      updatedBy
      error
      data
    }
  }
`

const DELETE_ROW = gql`
  mutation deleteRow($_id: ObjectId!) {
    deleteRow(_id: $_id)
  }
`

export function useAddRow() {
  return useMutation<{ addRow: Row }>(ADD_ROW, {
    update(cache, { data }) {
      if (!data) return      
      const newRow = data.addRow // Assumendo che la mutazione restituisca la nuova riga          
      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            // Controlla se la riga è già presente per evitare duplicati
            if (existingRows.some((row:StoreObject) => readField("_id", row) === newRow._id)) {
              return existingRows
            }
            return [...existingRows, newRow]
          },
        },
      })
    }
  })
}

export function usePatchRow() {
  return useMutation<{ patchRow: StoreObject }>(PATCH_ROW, {
    update(cache, { data }) {
      const updatedRow = data?.patchRow
      if (!updatedRow) return

      cache.modify({
        id: cache.identify(updatedRow),
        fields: Object.fromEntries(
          Object.entries(updatedRow).map(([key, value]) => [key, () => value])
        ),
      })
    }
  })
}

export function useDeleteRow() {
  return useMutation<{ deleteRow: string }>(DELETE_ROW, {
    update(cache, { data }) {
      const deletedId = data?.deleteRow
      if (!deletedId) return

      cache.modify({
        fields: {
          rows(existingRows = [], { readField }) {
            return existingRows.filter((row:StoreObject) => readField("_id", row) !== deletedId);
          },
        },
      })
    }
  })
}
