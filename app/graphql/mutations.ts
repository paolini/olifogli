import { gql } from '@apollo/client';

export const OLIMANAGER_BULK_UPDATE_RESULTS_MUTATION = gql`
  mutation OlimanagerBulkUpdateResults($rowIds: [ObjectId!], $sheetIds: [ObjectId!]) {
    olimanagerBulkUpdateResults(rowIds: $rowIds, sheetIds: $sheetIds)
  }
`;

export const OLIMANAGER_CREATE_PARTICIPANT_MUTATION = gql`
  mutation OlimanagerCreateParticipant($rowIds: [ObjectId!], $sheetIds: [ObjectId!]) {
    olimanagerCreateParticipant(rowIds: $rowIds, sheetIds: $sheetIds) {
      success
      error
      participantId
    }
  }
`;

export const OLIMANAGER_UPDATE_EXTRA_FIELDS_MUTATION = gql`
  mutation OlimanagerUpdateExtraFields($rowIds: [ObjectId!], $sheetIds: [ObjectId!]) {
    olimanagerUpdateExtraFields(rowIds: $rowIds, sheetIds: $sheetIds) {
      success
      skipped
      participantId
      error
    }
  }
`

export const REQUEST_SCAN_SHEET_GENERATION_MUTATION = gql`
  mutation RequestScanSheetGeneration($sheetId: ObjectId!, $selectedRowIds: [ObjectId!]) {
    requestScanSheetGeneration(sheetId: $sheetId, selectedRowIds: $selectedRowIds)
  }
`;

export const CREATE_SHEETS_MUTATION = gql`
  mutation CreateSheets($sheetId: ObjectId!, $rowIds: [ObjectId!]) {
    createSheets(sheetId: $sheetId, rowIds: $rowIds) 
  }
`;

const DELETE_SHEETS = gql`
    mutation DeleteSheets($ids: [ObjectId!]!) {
        deleteSheets(ids: $ids)
    }
`

