import { Dispatch, SetStateAction } from 'react'
import { ObjectId } from 'mongodb'
import { Data } from '@/app/lib/models'
import { Row } from '@/app/graphql/generated'

export type RowInputState = {
  rowIsBeingEdited: boolean,
  rowId: ObjectId|null,
  oldData: Data|null,
  newData: Data|null
}

export function startEditRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>,
  row: Row
) {
  setRowInputState({
    rowIsBeingEdited: true,
    rowId: row._id,
    oldData: row.data ?? null,
    newData: row.data ?? null
  })
}

export function startNewRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  setRowInputState({
    rowIsBeingEdited: true,
    rowId: null,
    oldData: null,
    newData: {}
  })
}

export function stopEditRow(
  setRowInputState: Dispatch<SetStateAction<RowInputState>>
) {
  setRowInputState({
    rowIsBeingEdited: false,
    rowId: null,
    oldData: null,
    newData: null
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
