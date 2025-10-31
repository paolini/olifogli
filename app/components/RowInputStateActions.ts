import { Dispatch, SetStateAction } from 'react'
import { ObjectId } from 'mongodb'
import { Data } from '@/app/lib/models'
import { Row } from '@/app/graphql/generated'

export type RowInputState = {
  rowIsBeingEdited: boolean,
  rowId: ObjectId|null,
  oldData: Data|null,
  newData: Data|null,
  focusFieldName: string|null,
  updatedOn: Date|null
}

export function startEditRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  row: Row,
  focusFieldName?: string | null
) {
  setRowInputState({
    rowIsBeingEdited: true,
    rowId: row._id,
    oldData: row.data ?? null,
    newData: row.data ?? null,
    focusFieldName: focusFieldName || null,
    updatedOn: row.updatedOn ? new Date(row.updatedOn) : null
  })
}

export function startNewRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  setRowInputState({
    rowIsBeingEdited: true,
    rowId: null,
    oldData: null,
    newData: {},
    focusFieldName: null,
    updatedOn: null
  })
}

export function stopEditRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  setRowInputState({
    rowIsBeingEdited: false,
    rowId: null,
    oldData: null,
    newData: null,
    focusFieldName: null,
    updatedOn: null
  })
}

export function updateNewData(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  newData: Data
) {
  setRowInputState(state => ({
    ...state,
    newData
  }))
}

export function syncAfterSave(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  setRowInputState(state => ({
    ...state,
    oldData: state.newData
  }))
}

export function saveAndContinue(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  nextRow: Row | null,
  focusFieldName?: string | null,
  newUpdatedOn?: Date | null
) {
  // Prima sincronizziamo i dati e aggiorniamo updatedOn
  setRowInputState(state => ({
    ...state,
    oldData: state.newData,
    updatedOn: newUpdatedOn || state.updatedOn
  }))
  
  // Poi passiamo direttamente alla riga successiva senza controllare modifiche
  // (perché le abbiamo appena salvate!)
  if (nextRow) {
    startEditRow(setRowInputState, nextRow, focusFieldName)
  } else {
    stopEditRow(setRowInputState)
  }
}

export function saveAndClose(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  stopEditRow(setRowInputState)
}

export function hasUnsavedChanges(rowInputState: RowInputState): boolean {
  if (!rowInputState.rowIsBeingEdited) return false
  if (!rowInputState.newData) return false
  
  // Caso nuova riga: verifica se ci sono campi compilati
  if (rowInputState.rowId === null) {
    return Object.values(rowInputState.newData).some(value => value !== '')
  }
  
  // Caso modifica riga esistente: confronta con i dati originali
  if (rowInputState.oldData) {
    return Object.keys(rowInputState.newData).some(
      key => rowInputState.newData![key] !== rowInputState.oldData![key]
    )
  }
  
  return false
}

export function handleRowChange(
  rowInputState: RowInputState,
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  newRow: Row | null,
  fieldName?: string | null
) {
  if (hasUnsavedChanges(rowInputState)) {
    const confirmed = confirm(
      'Ci sono modifiche non salvate. Vuoi abbandonare le modifiche e passare a un\'altra riga?'
    )
    if (!confirmed) {
      return // L'utente ha annullato, non cambiare riga
    }
  }
  
  // Procedi con il cambio di riga
  if (newRow) {
    startEditRow(setRowInputState, newRow, fieldName)
  } else {
    stopEditRow(setRowInputState)
  }
}
