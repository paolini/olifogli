import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { ObjectId } from 'bson';
import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Data: { input: any; output: any; }
  JSON: { input: JSON; output: JSON; }
  ObjectId: { input: ObjectId; output: ObjectId; }
  Timestamp: { input: Date; output: Date; }
};

export type Config = {
  __typename?: 'Config';
  OLIMANAGER_URL?: Maybe<Scalars['String']['output']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  addRow?: Maybe<Row>;
  addRows?: Maybe<Scalars['Int']['output']>;
  addSheet?: Maybe<Scalars['ObjectId']['output']>;
  addSheets?: Maybe<Scalars['Boolean']['output']>;
  addWorkbook?: Maybe<Workbook>;
  closeSheet?: Maybe<Scalars['Boolean']['output']>;
  deleteAllRows?: Maybe<Scalars['Int']['output']>;
  deleteRow?: Maybe<Scalars['ObjectId']['output']>;
  deleteScan?: Maybe<Scalars['Boolean']['output']>;
  deleteSheet?: Maybe<Scalars['Boolean']['output']>;
  deleteSheets?: Maybe<Scalars['Boolean']['output']>;
  deleteWorkbook?: Maybe<Scalars['ObjectId']['output']>;
  lockSheet?: Maybe<Scalars['Boolean']['output']>;
  openSheet?: Maybe<Scalars['Boolean']['output']>;
  patchRow?: Maybe<Row>;
  unlockSheet?: Maybe<Scalars['Boolean']['output']>;
  updateSheet?: Maybe<Scalars['Boolean']['output']>;
};


export type MutationAddRowArgs = {
  data: Scalars['Data']['input'];
  sheetId: Scalars['ObjectId']['input'];
};


export type MutationAddRowsArgs = {
  columns: Array<Scalars['String']['input']>;
  rows: Array<Array<Scalars['String']['input']>>;
  sheetId: Scalars['ObjectId']['input'];
};


export type MutationAddSheetArgs = {
  name: Scalars['String']['input'];
  permissions?: InputMaybe<Array<PermissionInput>>;
  schema: Scalars['String']['input'];
  workbookId: Scalars['ObjectId']['input'];
};


export type MutationAddSheetsArgs = {
  sheets: Array<SheetInput>;
};


export type MutationAddWorkbookArgs = {
  name: Scalars['String']['input'];
};


export type MutationCloseSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationDeleteAllRowsArgs = {
  sheetId: Scalars['ObjectId']['input'];
};


export type MutationDeleteRowArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationDeleteScanArgs = {
  jobId: Scalars['ObjectId']['input'];
};


export type MutationDeleteSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationDeleteSheetsArgs = {
  ids: Array<Scalars['ObjectId']['input']>;
};


export type MutationDeleteWorkbookArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationLockSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationOpenSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationPatchRowArgs = {
  _id: Scalars['ObjectId']['input'];
  data: Scalars['Data']['input'];
  updatedOn: Scalars['Timestamp']['input'];
};


export type MutationUnlockSheetArgs = {
  _id: Scalars['ObjectId']['input'];
};


export type MutationUpdateSheetArgs = {
  _id: Scalars['ObjectId']['input'];
  commonData?: InputMaybe<Scalars['Data']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  permissions?: InputMaybe<Array<PermissionInput>>;
  schema?: InputMaybe<Scalars['String']['input']>;
};

export type Permission = {
  __typename?: 'Permission';
  email?: Maybe<Scalars['String']['output']>;
  role: Scalars['String']['output'];
  userId?: Maybe<Scalars['ObjectId']['output']>;
};

export type PermissionInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  role: Scalars['String']['input'];
  userId?: InputMaybe<Scalars['ObjectId']['input']>;
};

export type Query = {
  __typename?: 'Query';
  appInstance?: Maybe<Scalars['String']['output']>;
  config?: Maybe<Config>;
  hello?: Maybe<Scalars['String']['output']>;
  me?: Maybe<User>;
  olimanager?: Maybe<Scalars['String']['output']>;
  rows: Array<Row>;
  scanJobs: Array<ScanJob>;
  scanResults: Array<ScanResults>;
  sheet?: Maybe<Sheet>;
  sheets: Array<Sheet>;
  users?: Maybe<Array<Maybe<User>>>;
  workbook?: Maybe<Workbook>;
  workbooks?: Maybe<Array<Maybe<Workbook>>>;
};


export type QueryRowsArgs = {
  sheetId: Scalars['ObjectId']['input'];
};


export type QueryScanJobsArgs = {
  sheetId: Scalars['ObjectId']['input'];
  userId?: InputMaybe<Scalars['ObjectId']['input']>;
};


export type QueryScanResultsArgs = {
  jobId: Scalars['ObjectId']['input'];
};


export type QuerySheetArgs = {
  sheetId: Scalars['ObjectId']['input'];
};


export type QuerySheetsArgs = {
  workbookId?: InputMaybe<Scalars['ObjectId']['input']>;
};


export type QueryWorkbookArgs = {
  workbookId: Scalars['ObjectId']['input'];
};

export type Row = {
  __typename?: 'Row';
  _id: Scalars['ObjectId']['output'];
  data: Scalars['Data']['output'];
  isValid: Scalars['Boolean']['output'];
  updatedOn: Scalars['Timestamp']['output'];
};

export type ScanJob = {
  __typename?: 'ScanJob';
  _id: Scalars['ObjectId']['output'];
  messages: Array<ScanMessage>;
  ownerId: Scalars['ObjectId']['output'];
  sheetId: Scalars['ObjectId']['output'];
  timestamp: Scalars['Timestamp']['output'];
};

export type ScanMessage = {
  __typename?: 'ScanMessage';
  message: Scalars['String']['output'];
  status: Scalars['String']['output'];
  timestamp: Scalars['Timestamp']['output'];
};

export type ScanResults = {
  __typename?: 'ScanResults';
  _id: Scalars['ObjectId']['output'];
  image: Scalars['String']['output'];
  jobId: Scalars['ObjectId']['output'];
  rawData: Scalars['Data']['output'];
};

export type Sheet = {
  __typename?: 'Sheet';
  _id: Scalars['ObjectId']['output'];
  closed?: Maybe<Scalars['Boolean']['output']>;
  closedBy?: Maybe<Scalars['String']['output']>;
  closedOn?: Maybe<Scalars['Timestamp']['output']>;
  commonData: Scalars['Data']['output'];
  locked?: Maybe<Scalars['Boolean']['output']>;
  lockedBy?: Maybe<Scalars['String']['output']>;
  lockedOn?: Maybe<Scalars['Timestamp']['output']>;
  nRows: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['ObjectId']['output'];
  permissions: Array<Permission>;
  schema: Scalars['String']['output'];
  workbook: Workbook;
};

export type SheetInput = {
  commonData?: InputMaybe<Scalars['Data']['input']>;
  name: Scalars['String']['input'];
  permissions?: InputMaybe<Array<PermissionInput>>;
  schema: Scalars['String']['input'];
  workbookId: Scalars['ObjectId']['input'];
};

export type User = {
  __typename?: 'User';
  _id: Scalars['ObjectId']['output'];
  email: Scalars['String']['output'];
  isAdmin?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  uid?: Maybe<Scalars['Int']['output']>;
};

export type Workbook = {
  __typename?: 'Workbook';
  _id?: Maybe<Scalars['ObjectId']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  ownerId?: Maybe<Scalars['ObjectId']['output']>;
  sheetsCount?: Maybe<Scalars['Int']['output']>;
};

export type AddRowsMutationVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
  columns: Array<Scalars['String']['input']> | Scalars['String']['input'];
  rows: Array<Array<Scalars['String']['input']> | Scalars['String']['input']> | Array<Scalars['String']['input']> | Scalars['String']['input'];
}>;


export type AddRowsMutation = { __typename?: 'Mutation', addRows?: number | null };

export type AppInstanceQueryVariables = Exact<{ [key: string]: never; }>;


export type AppInstanceQuery = { __typename?: 'Query', appInstance?: string | null };

export type ScanJobsQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type ScanJobsQuery = { __typename?: 'Query', scanJobs: Array<{ __typename?: 'ScanJob', _id: ObjectId, timestamp: Date, sheetId: ObjectId, ownerId: ObjectId, messages: Array<{ __typename?: 'ScanMessage', status: string, message: string, timestamp: Date }> }> };

export type DeleteScanMutationVariables = Exact<{
  jobId: Scalars['ObjectId']['input'];
}>;


export type DeleteScanMutation = { __typename?: 'Mutation', deleteScan?: boolean | null };

export type ScanResultsQueryVariables = Exact<{
  jobId: Scalars['ObjectId']['input'];
}>;


export type ScanResultsQuery = { __typename?: 'Query', scanResults: Array<{ __typename?: 'ScanResults', _id: ObjectId, jobId: ObjectId, image: string, rawData: any }> };

export type AddSheetsMutationVariables = Exact<{
  sheets: Array<SheetInput> | SheetInput;
}>;


export type AddSheetsMutation = { __typename?: 'Mutation', addSheets?: boolean | null };

export type GetSheetQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type GetSheetQuery = { __typename?: 'Query', sheet?: { __typename?: 'Sheet', _id: ObjectId, name: string, schema: string, commonData: any, ownerId: ObjectId, nRows: number, closed?: boolean | null, closedBy?: string | null, closedOn?: Date | null, locked?: boolean | null, lockedBy?: string | null, lockedOn?: Date | null, permissions: Array<{ __typename?: 'Permission', email?: string | null, userId?: ObjectId | null, role: string }>, workbook: { __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null } } | null };

export type GetRowsQueryVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type GetRowsQuery = { __typename?: 'Query', rows: Array<{ __typename?: 'Row', _id: ObjectId, isValid: boolean, data: any, updatedOn: Date }> };

export type DeleteSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type DeleteSheetMutation = { __typename?: 'Mutation', deleteSheet?: boolean | null };

export type UpdateSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
  permissions?: InputMaybe<Array<PermissionInput> | PermissionInput>;
  commonData?: InputMaybe<Scalars['Data']['input']>;
}>;


export type UpdateSheetMutation = { __typename?: 'Mutation', updateSheet?: boolean | null };

export type DeleteAllRowsMutationVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
}>;


export type DeleteAllRowsMutation = { __typename?: 'Mutation', deleteAllRows?: number | null };

export type CloseSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type CloseSheetMutation = { __typename?: 'Mutation', closeSheet?: boolean | null };

export type OpenSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type OpenSheetMutation = { __typename?: 'Mutation', openSheet?: boolean | null };

export type LockSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type LockSheetMutation = { __typename?: 'Mutation', lockSheet?: boolean | null };

export type UnlockSheetMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type UnlockSheetMutation = { __typename?: 'Mutation', unlockSheet?: boolean | null };

export type GetSheetsQueryVariables = Exact<{
  workbookId?: InputMaybe<Scalars['ObjectId']['input']>;
}>;


export type GetSheetsQuery = { __typename?: 'Query', sheets: Array<{ __typename?: 'Sheet', _id: ObjectId, name: string, schema: string, commonData: any, nRows: number, ownerId: ObjectId, permissions: Array<{ __typename?: 'Permission', email?: string | null, userId?: ObjectId | null, role: string }> }> };

export type AddSheetMutationVariables = Exact<{
  name: Scalars['String']['input'];
  schema: Scalars['String']['input'];
  workbookId: Scalars['ObjectId']['input'];
  permissions?: InputMaybe<Array<PermissionInput> | PermissionInput>;
}>;


export type AddSheetMutation = { __typename?: 'Mutation', addSheet?: ObjectId | null };

export type DeleteSheetsMutationVariables = Exact<{
  ids: Array<Scalars['ObjectId']['input']> | Scalars['ObjectId']['input'];
}>;


export type DeleteSheetsMutation = { __typename?: 'Mutation', deleteSheets?: boolean | null };

export type DeleteWorkbookMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type DeleteWorkbookMutation = { __typename?: 'Mutation', deleteWorkbook?: ObjectId | null };

export type AddRowMutationVariables = Exact<{
  sheetId: Scalars['ObjectId']['input'];
  data: Scalars['Data']['input'];
}>;


export type AddRowMutation = { __typename?: 'Mutation', addRow?: { __typename?: 'Row', _id: ObjectId, isValid: boolean, data: any } | null };

export type PatchRowMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
  updatedOn: Scalars['Timestamp']['input'];
  data: Scalars['Data']['input'];
}>;


export type PatchRowMutation = { __typename?: 'Mutation', patchRow?: { __typename: 'Row', _id: ObjectId, updatedOn: Date, isValid: boolean, data: any } | null };

export type DeleteRowMutationVariables = Exact<{
  _id: Scalars['ObjectId']['input'];
}>;


export type DeleteRowMutation = { __typename?: 'Mutation', deleteRow?: ObjectId | null };

export type GetWorkbookQueryVariables = Exact<{
  workbookId: Scalars['ObjectId']['input'];
}>;


export type GetWorkbookQuery = { __typename?: 'Query', workbook?: { __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null } | null, sheets: Array<{ __typename?: 'Sheet', _id: ObjectId }> };

export type GetWorkbooksQueryVariables = Exact<{ [key: string]: never; }>;


export type GetWorkbooksQuery = { __typename?: 'Query', workbooks?: Array<{ __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null, sheetsCount?: number | null } | null> | null };

export type AddWorkbookMutationVariables = Exact<{
  name: Scalars['String']['input'];
}>;


export type AddWorkbookMutation = { __typename?: 'Mutation', addWorkbook?: { __typename?: 'Workbook', _id?: ObjectId | null, name?: string | null } | null };

export type GetProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type GetProfileQuery = { __typename?: 'Query', me?: { __typename?: 'User', _id: ObjectId, isAdmin?: boolean | null, email: string, name?: string | null } | null };

export type GetConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type GetConfigQuery = { __typename?: 'Query', config?: { __typename?: 'Config', OLIMANAGER_URL?: string | null } | null };

export type GetUsersQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUsersQuery = { __typename?: 'Query', users?: Array<{ __typename?: 'User', _id: ObjectId, email: string, isAdmin?: boolean | null } | null> | null };


export const AddRowsDocument = gql`
    mutation addRows($sheetId: ObjectId!, $columns: [String!]!, $rows: [[String!]!]!) {
  addRows(sheetId: $sheetId, columns: $columns, rows: $rows)
}
    `;
export type AddRowsMutationFn = Apollo.MutationFunction<AddRowsMutation, AddRowsMutationVariables>;

/**
 * __useAddRowsMutation__
 *
 * To run a mutation, you first call `useAddRowsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddRowsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addRowsMutation, { data, loading, error }] = useAddRowsMutation({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *      columns: // value for 'columns'
 *      rows: // value for 'rows'
 *   },
 * });
 */
export function useAddRowsMutation(baseOptions?: Apollo.MutationHookOptions<AddRowsMutation, AddRowsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddRowsMutation, AddRowsMutationVariables>(AddRowsDocument, options);
      }
export type AddRowsMutationHookResult = ReturnType<typeof useAddRowsMutation>;
export type AddRowsMutationResult = Apollo.MutationResult<AddRowsMutation>;
export type AddRowsMutationOptions = Apollo.BaseMutationOptions<AddRowsMutation, AddRowsMutationVariables>;
export const AppInstanceDocument = gql`
    query AppInstance {
  appInstance
}
    `;

/**
 * __useAppInstanceQuery__
 *
 * To run a query within a React component, call `useAppInstanceQuery` and pass it any options that fit your needs.
 * When your component renders, `useAppInstanceQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useAppInstanceQuery({
 *   variables: {
 *   },
 * });
 */
export function useAppInstanceQuery(baseOptions?: Apollo.QueryHookOptions<AppInstanceQuery, AppInstanceQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<AppInstanceQuery, AppInstanceQueryVariables>(AppInstanceDocument, options);
      }
export function useAppInstanceLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<AppInstanceQuery, AppInstanceQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<AppInstanceQuery, AppInstanceQueryVariables>(AppInstanceDocument, options);
        }
export function useAppInstanceSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<AppInstanceQuery, AppInstanceQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<AppInstanceQuery, AppInstanceQueryVariables>(AppInstanceDocument, options);
        }
export type AppInstanceQueryHookResult = ReturnType<typeof useAppInstanceQuery>;
export type AppInstanceLazyQueryHookResult = ReturnType<typeof useAppInstanceLazyQuery>;
export type AppInstanceSuspenseQueryHookResult = ReturnType<typeof useAppInstanceSuspenseQuery>;
export type AppInstanceQueryResult = Apollo.QueryResult<AppInstanceQuery, AppInstanceQueryVariables>;
export const ScanJobsDocument = gql`
    query ScanJobs($sheetId: ObjectId!) {
  scanJobs(sheetId: $sheetId) {
    _id
    timestamp
    sheetId
    ownerId
    messages {
      status
      message
      timestamp
    }
  }
}
    `;

/**
 * __useScanJobsQuery__
 *
 * To run a query within a React component, call `useScanJobsQuery` and pass it any options that fit your needs.
 * When your component renders, `useScanJobsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useScanJobsQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useScanJobsQuery(baseOptions: Apollo.QueryHookOptions<ScanJobsQuery, ScanJobsQueryVariables> & ({ variables: ScanJobsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ScanJobsQuery, ScanJobsQueryVariables>(ScanJobsDocument, options);
      }
export function useScanJobsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ScanJobsQuery, ScanJobsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ScanJobsQuery, ScanJobsQueryVariables>(ScanJobsDocument, options);
        }
export function useScanJobsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ScanJobsQuery, ScanJobsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ScanJobsQuery, ScanJobsQueryVariables>(ScanJobsDocument, options);
        }
export type ScanJobsQueryHookResult = ReturnType<typeof useScanJobsQuery>;
export type ScanJobsLazyQueryHookResult = ReturnType<typeof useScanJobsLazyQuery>;
export type ScanJobsSuspenseQueryHookResult = ReturnType<typeof useScanJobsSuspenseQuery>;
export type ScanJobsQueryResult = Apollo.QueryResult<ScanJobsQuery, ScanJobsQueryVariables>;
export const DeleteScanDocument = gql`
    mutation DeleteScan($jobId: ObjectId!) {
  deleteScan(jobId: $jobId)
}
    `;
export type DeleteScanMutationFn = Apollo.MutationFunction<DeleteScanMutation, DeleteScanMutationVariables>;

/**
 * __useDeleteScanMutation__
 *
 * To run a mutation, you first call `useDeleteScanMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteScanMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteScanMutation, { data, loading, error }] = useDeleteScanMutation({
 *   variables: {
 *      jobId: // value for 'jobId'
 *   },
 * });
 */
export function useDeleteScanMutation(baseOptions?: Apollo.MutationHookOptions<DeleteScanMutation, DeleteScanMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteScanMutation, DeleteScanMutationVariables>(DeleteScanDocument, options);
      }
export type DeleteScanMutationHookResult = ReturnType<typeof useDeleteScanMutation>;
export type DeleteScanMutationResult = Apollo.MutationResult<DeleteScanMutation>;
export type DeleteScanMutationOptions = Apollo.BaseMutationOptions<DeleteScanMutation, DeleteScanMutationVariables>;
export const ScanResultsDocument = gql`
    query ScanResults($jobId: ObjectId!) {
  scanResults(jobId: $jobId) {
    _id
    jobId
    image
    rawData
  }
}
    `;

/**
 * __useScanResultsQuery__
 *
 * To run a query within a React component, call `useScanResultsQuery` and pass it any options that fit your needs.
 * When your component renders, `useScanResultsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useScanResultsQuery({
 *   variables: {
 *      jobId: // value for 'jobId'
 *   },
 * });
 */
export function useScanResultsQuery(baseOptions: Apollo.QueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables> & ({ variables: ScanResultsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
      }
export function useScanResultsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
        }
export function useScanResultsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<ScanResultsQuery, ScanResultsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<ScanResultsQuery, ScanResultsQueryVariables>(ScanResultsDocument, options);
        }
export type ScanResultsQueryHookResult = ReturnType<typeof useScanResultsQuery>;
export type ScanResultsLazyQueryHookResult = ReturnType<typeof useScanResultsLazyQuery>;
export type ScanResultsSuspenseQueryHookResult = ReturnType<typeof useScanResultsSuspenseQuery>;
export type ScanResultsQueryResult = Apollo.QueryResult<ScanResultsQuery, ScanResultsQueryVariables>;
export const AddSheetsDocument = gql`
    mutation AddSheets($sheets: [SheetInput!]!) {
  addSheets(sheets: $sheets)
}
    `;
export type AddSheetsMutationFn = Apollo.MutationFunction<AddSheetsMutation, AddSheetsMutationVariables>;

/**
 * __useAddSheetsMutation__
 *
 * To run a mutation, you first call `useAddSheetsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddSheetsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addSheetsMutation, { data, loading, error }] = useAddSheetsMutation({
 *   variables: {
 *      sheets: // value for 'sheets'
 *   },
 * });
 */
export function useAddSheetsMutation(baseOptions?: Apollo.MutationHookOptions<AddSheetsMutation, AddSheetsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddSheetsMutation, AddSheetsMutationVariables>(AddSheetsDocument, options);
      }
export type AddSheetsMutationHookResult = ReturnType<typeof useAddSheetsMutation>;
export type AddSheetsMutationResult = Apollo.MutationResult<AddSheetsMutation>;
export type AddSheetsMutationOptions = Apollo.BaseMutationOptions<AddSheetsMutation, AddSheetsMutationVariables>;
export const GetSheetDocument = gql`
    query getSheet($sheetId: ObjectId!) {
  sheet(sheetId: $sheetId) {
    _id
    name
    schema
    permissions {
      email
      userId
      role
    }
    workbook {
      _id
      name
    }
    commonData
    ownerId
    nRows
    closed
    closedBy
    closedOn
    locked
    lockedBy
    lockedOn
  }
}
    `;

/**
 * __useGetSheetQuery__
 *
 * To run a query within a React component, call `useGetSheetQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSheetQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSheetQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useGetSheetQuery(baseOptions: Apollo.QueryHookOptions<GetSheetQuery, GetSheetQueryVariables> & ({ variables: GetSheetQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
      }
export function useGetSheetLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSheetQuery, GetSheetQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
        }
export function useGetSheetSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSheetQuery, GetSheetQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSheetQuery, GetSheetQueryVariables>(GetSheetDocument, options);
        }
export type GetSheetQueryHookResult = ReturnType<typeof useGetSheetQuery>;
export type GetSheetLazyQueryHookResult = ReturnType<typeof useGetSheetLazyQuery>;
export type GetSheetSuspenseQueryHookResult = ReturnType<typeof useGetSheetSuspenseQuery>;
export type GetSheetQueryResult = Apollo.QueryResult<GetSheetQuery, GetSheetQueryVariables>;
export const GetRowsDocument = gql`
    query getRows($sheetId: ObjectId!) {
  rows(sheetId: $sheetId) {
    _id
    isValid
    data
    updatedOn
  }
}
    `;

/**
 * __useGetRowsQuery__
 *
 * To run a query within a React component, call `useGetRowsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRowsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRowsQuery({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useGetRowsQuery(baseOptions: Apollo.QueryHookOptions<GetRowsQuery, GetRowsQueryVariables> & ({ variables: GetRowsQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
      }
export function useGetRowsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRowsQuery, GetRowsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
        }
export function useGetRowsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetRowsQuery, GetRowsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetRowsQuery, GetRowsQueryVariables>(GetRowsDocument, options);
        }
export type GetRowsQueryHookResult = ReturnType<typeof useGetRowsQuery>;
export type GetRowsLazyQueryHookResult = ReturnType<typeof useGetRowsLazyQuery>;
export type GetRowsSuspenseQueryHookResult = ReturnType<typeof useGetRowsSuspenseQuery>;
export type GetRowsQueryResult = Apollo.QueryResult<GetRowsQuery, GetRowsQueryVariables>;
export const DeleteSheetDocument = gql`
    mutation DeleteSheet($_id: ObjectId!) {
  deleteSheet(_id: $_id)
}
    `;
export type DeleteSheetMutationFn = Apollo.MutationFunction<DeleteSheetMutation, DeleteSheetMutationVariables>;

/**
 * __useDeleteSheetMutation__
 *
 * To run a mutation, you first call `useDeleteSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteSheetMutation, { data, loading, error }] = useDeleteSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useDeleteSheetMutation(baseOptions?: Apollo.MutationHookOptions<DeleteSheetMutation, DeleteSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteSheetMutation, DeleteSheetMutationVariables>(DeleteSheetDocument, options);
      }
export type DeleteSheetMutationHookResult = ReturnType<typeof useDeleteSheetMutation>;
export type DeleteSheetMutationResult = Apollo.MutationResult<DeleteSheetMutation>;
export type DeleteSheetMutationOptions = Apollo.BaseMutationOptions<DeleteSheetMutation, DeleteSheetMutationVariables>;
export const UpdateSheetDocument = gql`
    mutation UpdateSheet($_id: ObjectId!, $permissions: [PermissionInput!], $commonData: Data) {
  updateSheet(_id: $_id, permissions: $permissions, commonData: $commonData)
}
    `;
export type UpdateSheetMutationFn = Apollo.MutationFunction<UpdateSheetMutation, UpdateSheetMutationVariables>;

/**
 * __useUpdateSheetMutation__
 *
 * To run a mutation, you first call `useUpdateSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateSheetMutation, { data, loading, error }] = useUpdateSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *      permissions: // value for 'permissions'
 *      commonData: // value for 'commonData'
 *   },
 * });
 */
export function useUpdateSheetMutation(baseOptions?: Apollo.MutationHookOptions<UpdateSheetMutation, UpdateSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateSheetMutation, UpdateSheetMutationVariables>(UpdateSheetDocument, options);
      }
export type UpdateSheetMutationHookResult = ReturnType<typeof useUpdateSheetMutation>;
export type UpdateSheetMutationResult = Apollo.MutationResult<UpdateSheetMutation>;
export type UpdateSheetMutationOptions = Apollo.BaseMutationOptions<UpdateSheetMutation, UpdateSheetMutationVariables>;
export const DeleteAllRowsDocument = gql`
    mutation DeleteAllRows($sheetId: ObjectId!) {
  deleteAllRows(sheetId: $sheetId)
}
    `;
export type DeleteAllRowsMutationFn = Apollo.MutationFunction<DeleteAllRowsMutation, DeleteAllRowsMutationVariables>;

/**
 * __useDeleteAllRowsMutation__
 *
 * To run a mutation, you first call `useDeleteAllRowsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAllRowsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAllRowsMutation, { data, loading, error }] = useDeleteAllRowsMutation({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *   },
 * });
 */
export function useDeleteAllRowsMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAllRowsMutation, DeleteAllRowsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAllRowsMutation, DeleteAllRowsMutationVariables>(DeleteAllRowsDocument, options);
      }
export type DeleteAllRowsMutationHookResult = ReturnType<typeof useDeleteAllRowsMutation>;
export type DeleteAllRowsMutationResult = Apollo.MutationResult<DeleteAllRowsMutation>;
export type DeleteAllRowsMutationOptions = Apollo.BaseMutationOptions<DeleteAllRowsMutation, DeleteAllRowsMutationVariables>;
export const CloseSheetDocument = gql`
    mutation CloseSheet($_id: ObjectId!) {
  closeSheet(_id: $_id)
}
    `;
export type CloseSheetMutationFn = Apollo.MutationFunction<CloseSheetMutation, CloseSheetMutationVariables>;

/**
 * __useCloseSheetMutation__
 *
 * To run a mutation, you first call `useCloseSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCloseSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [closeSheetMutation, { data, loading, error }] = useCloseSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useCloseSheetMutation(baseOptions?: Apollo.MutationHookOptions<CloseSheetMutation, CloseSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CloseSheetMutation, CloseSheetMutationVariables>(CloseSheetDocument, options);
      }
export type CloseSheetMutationHookResult = ReturnType<typeof useCloseSheetMutation>;
export type CloseSheetMutationResult = Apollo.MutationResult<CloseSheetMutation>;
export type CloseSheetMutationOptions = Apollo.BaseMutationOptions<CloseSheetMutation, CloseSheetMutationVariables>;
export const OpenSheetDocument = gql`
    mutation OpenSheet($_id: ObjectId!) {
  openSheet(_id: $_id)
}
    `;
export type OpenSheetMutationFn = Apollo.MutationFunction<OpenSheetMutation, OpenSheetMutationVariables>;

/**
 * __useOpenSheetMutation__
 *
 * To run a mutation, you first call `useOpenSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useOpenSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [openSheetMutation, { data, loading, error }] = useOpenSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useOpenSheetMutation(baseOptions?: Apollo.MutationHookOptions<OpenSheetMutation, OpenSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<OpenSheetMutation, OpenSheetMutationVariables>(OpenSheetDocument, options);
      }
export type OpenSheetMutationHookResult = ReturnType<typeof useOpenSheetMutation>;
export type OpenSheetMutationResult = Apollo.MutationResult<OpenSheetMutation>;
export type OpenSheetMutationOptions = Apollo.BaseMutationOptions<OpenSheetMutation, OpenSheetMutationVariables>;
export const LockSheetDocument = gql`
    mutation LockSheet($_id: ObjectId!) {
  lockSheet(_id: $_id)
}
    `;
export type LockSheetMutationFn = Apollo.MutationFunction<LockSheetMutation, LockSheetMutationVariables>;

/**
 * __useLockSheetMutation__
 *
 * To run a mutation, you first call `useLockSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLockSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [lockSheetMutation, { data, loading, error }] = useLockSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useLockSheetMutation(baseOptions?: Apollo.MutationHookOptions<LockSheetMutation, LockSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<LockSheetMutation, LockSheetMutationVariables>(LockSheetDocument, options);
      }
export type LockSheetMutationHookResult = ReturnType<typeof useLockSheetMutation>;
export type LockSheetMutationResult = Apollo.MutationResult<LockSheetMutation>;
export type LockSheetMutationOptions = Apollo.BaseMutationOptions<LockSheetMutation, LockSheetMutationVariables>;
export const UnlockSheetDocument = gql`
    mutation UnlockSheet($_id: ObjectId!) {
  unlockSheet(_id: $_id)
}
    `;
export type UnlockSheetMutationFn = Apollo.MutationFunction<UnlockSheetMutation, UnlockSheetMutationVariables>;

/**
 * __useUnlockSheetMutation__
 *
 * To run a mutation, you first call `useUnlockSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnlockSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unlockSheetMutation, { data, loading, error }] = useUnlockSheetMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useUnlockSheetMutation(baseOptions?: Apollo.MutationHookOptions<UnlockSheetMutation, UnlockSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnlockSheetMutation, UnlockSheetMutationVariables>(UnlockSheetDocument, options);
      }
export type UnlockSheetMutationHookResult = ReturnType<typeof useUnlockSheetMutation>;
export type UnlockSheetMutationResult = Apollo.MutationResult<UnlockSheetMutation>;
export type UnlockSheetMutationOptions = Apollo.BaseMutationOptions<UnlockSheetMutation, UnlockSheetMutationVariables>;
export const GetSheetsDocument = gql`
    query GetSheets($workbookId: ObjectId) {
  sheets(workbookId: $workbookId) {
    _id
    name
    schema
    commonData
    permissions {
      email
      userId
      role
    }
    nRows
    ownerId
  }
}
    `;

/**
 * __useGetSheetsQuery__
 *
 * To run a query within a React component, call `useGetSheetsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetSheetsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetSheetsQuery({
 *   variables: {
 *      workbookId: // value for 'workbookId'
 *   },
 * });
 */
export function useGetSheetsQuery(baseOptions?: Apollo.QueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
      }
export function useGetSheetsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
        }
export function useGetSheetsSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetSheetsQuery, GetSheetsQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetSheetsQuery, GetSheetsQueryVariables>(GetSheetsDocument, options);
        }
export type GetSheetsQueryHookResult = ReturnType<typeof useGetSheetsQuery>;
export type GetSheetsLazyQueryHookResult = ReturnType<typeof useGetSheetsLazyQuery>;
export type GetSheetsSuspenseQueryHookResult = ReturnType<typeof useGetSheetsSuspenseQuery>;
export type GetSheetsQueryResult = Apollo.QueryResult<GetSheetsQuery, GetSheetsQueryVariables>;
export const AddSheetDocument = gql`
    mutation AddSheet($name: String!, $schema: String!, $workbookId: ObjectId!, $permissions: [PermissionInput!]) {
  addSheet(
    name: $name
    schema: $schema
    workbookId: $workbookId
    permissions: $permissions
  )
}
    `;
export type AddSheetMutationFn = Apollo.MutationFunction<AddSheetMutation, AddSheetMutationVariables>;

/**
 * __useAddSheetMutation__
 *
 * To run a mutation, you first call `useAddSheetMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddSheetMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addSheetMutation, { data, loading, error }] = useAddSheetMutation({
 *   variables: {
 *      name: // value for 'name'
 *      schema: // value for 'schema'
 *      workbookId: // value for 'workbookId'
 *      permissions: // value for 'permissions'
 *   },
 * });
 */
export function useAddSheetMutation(baseOptions?: Apollo.MutationHookOptions<AddSheetMutation, AddSheetMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddSheetMutation, AddSheetMutationVariables>(AddSheetDocument, options);
      }
export type AddSheetMutationHookResult = ReturnType<typeof useAddSheetMutation>;
export type AddSheetMutationResult = Apollo.MutationResult<AddSheetMutation>;
export type AddSheetMutationOptions = Apollo.BaseMutationOptions<AddSheetMutation, AddSheetMutationVariables>;
export const DeleteSheetsDocument = gql`
    mutation DeleteSheets($ids: [ObjectId!]!) {
  deleteSheets(ids: $ids)
}
    `;
export type DeleteSheetsMutationFn = Apollo.MutationFunction<DeleteSheetsMutation, DeleteSheetsMutationVariables>;

/**
 * __useDeleteSheetsMutation__
 *
 * To run a mutation, you first call `useDeleteSheetsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteSheetsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteSheetsMutation, { data, loading, error }] = useDeleteSheetsMutation({
 *   variables: {
 *      ids: // value for 'ids'
 *   },
 * });
 */
export function useDeleteSheetsMutation(baseOptions?: Apollo.MutationHookOptions<DeleteSheetsMutation, DeleteSheetsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteSheetsMutation, DeleteSheetsMutationVariables>(DeleteSheetsDocument, options);
      }
export type DeleteSheetsMutationHookResult = ReturnType<typeof useDeleteSheetsMutation>;
export type DeleteSheetsMutationResult = Apollo.MutationResult<DeleteSheetsMutation>;
export type DeleteSheetsMutationOptions = Apollo.BaseMutationOptions<DeleteSheetsMutation, DeleteSheetsMutationVariables>;
export const DeleteWorkbookDocument = gql`
    mutation DeleteWorkbook($_id: ObjectId!) {
  deleteWorkbook(_id: $_id)
}
    `;
export type DeleteWorkbookMutationFn = Apollo.MutationFunction<DeleteWorkbookMutation, DeleteWorkbookMutationVariables>;

/**
 * __useDeleteWorkbookMutation__
 *
 * To run a mutation, you first call `useDeleteWorkbookMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteWorkbookMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteWorkbookMutation, { data, loading, error }] = useDeleteWorkbookMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useDeleteWorkbookMutation(baseOptions?: Apollo.MutationHookOptions<DeleteWorkbookMutation, DeleteWorkbookMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteWorkbookMutation, DeleteWorkbookMutationVariables>(DeleteWorkbookDocument, options);
      }
export type DeleteWorkbookMutationHookResult = ReturnType<typeof useDeleteWorkbookMutation>;
export type DeleteWorkbookMutationResult = Apollo.MutationResult<DeleteWorkbookMutation>;
export type DeleteWorkbookMutationOptions = Apollo.BaseMutationOptions<DeleteWorkbookMutation, DeleteWorkbookMutationVariables>;
export const AddRowDocument = gql`
    mutation addRow($sheetId: ObjectId!, $data: Data!) {
  addRow(sheetId: $sheetId, data: $data) {
    _id
    isValid
    data
  }
}
    `;
export type AddRowMutationFn = Apollo.MutationFunction<AddRowMutation, AddRowMutationVariables>;

/**
 * __useAddRowMutation__
 *
 * To run a mutation, you first call `useAddRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addRowMutation, { data, loading, error }] = useAddRowMutation({
 *   variables: {
 *      sheetId: // value for 'sheetId'
 *      data: // value for 'data'
 *   },
 * });
 */
export function useAddRowMutation(baseOptions?: Apollo.MutationHookOptions<AddRowMutation, AddRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddRowMutation, AddRowMutationVariables>(AddRowDocument, options);
      }
export type AddRowMutationHookResult = ReturnType<typeof useAddRowMutation>;
export type AddRowMutationResult = Apollo.MutationResult<AddRowMutation>;
export type AddRowMutationOptions = Apollo.BaseMutationOptions<AddRowMutation, AddRowMutationVariables>;
export const PatchRowDocument = gql`
    mutation PatchRow($_id: ObjectId!, $updatedOn: Timestamp!, $data: Data!) {
  patchRow(_id: $_id, updatedOn: $updatedOn, data: $data) {
    _id
    __typename
    updatedOn
    isValid
    data
  }
}
    `;
export type PatchRowMutationFn = Apollo.MutationFunction<PatchRowMutation, PatchRowMutationVariables>;

/**
 * __usePatchRowMutation__
 *
 * To run a mutation, you first call `usePatchRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `usePatchRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [patchRowMutation, { data, loading, error }] = usePatchRowMutation({
 *   variables: {
 *      _id: // value for '_id'
 *      updatedOn: // value for 'updatedOn'
 *      data: // value for 'data'
 *   },
 * });
 */
export function usePatchRowMutation(baseOptions?: Apollo.MutationHookOptions<PatchRowMutation, PatchRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<PatchRowMutation, PatchRowMutationVariables>(PatchRowDocument, options);
      }
export type PatchRowMutationHookResult = ReturnType<typeof usePatchRowMutation>;
export type PatchRowMutationResult = Apollo.MutationResult<PatchRowMutation>;
export type PatchRowMutationOptions = Apollo.BaseMutationOptions<PatchRowMutation, PatchRowMutationVariables>;
export const DeleteRowDocument = gql`
    mutation deleteRow($_id: ObjectId!) {
  deleteRow(_id: $_id)
}
    `;
export type DeleteRowMutationFn = Apollo.MutationFunction<DeleteRowMutation, DeleteRowMutationVariables>;

/**
 * __useDeleteRowMutation__
 *
 * To run a mutation, you first call `useDeleteRowMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteRowMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteRowMutation, { data, loading, error }] = useDeleteRowMutation({
 *   variables: {
 *      _id: // value for '_id'
 *   },
 * });
 */
export function useDeleteRowMutation(baseOptions?: Apollo.MutationHookOptions<DeleteRowMutation, DeleteRowMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteRowMutation, DeleteRowMutationVariables>(DeleteRowDocument, options);
      }
export type DeleteRowMutationHookResult = ReturnType<typeof useDeleteRowMutation>;
export type DeleteRowMutationResult = Apollo.MutationResult<DeleteRowMutation>;
export type DeleteRowMutationOptions = Apollo.BaseMutationOptions<DeleteRowMutation, DeleteRowMutationVariables>;
export const GetWorkbookDocument = gql`
    query GetWorkbook($workbookId: ObjectId!) {
  workbook(workbookId: $workbookId) {
    _id
    name
  }
  sheets(workbookId: $workbookId) {
    _id
  }
}
    `;

/**
 * __useGetWorkbookQuery__
 *
 * To run a query within a React component, call `useGetWorkbookQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetWorkbookQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetWorkbookQuery({
 *   variables: {
 *      workbookId: // value for 'workbookId'
 *   },
 * });
 */
export function useGetWorkbookQuery(baseOptions: Apollo.QueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables> & ({ variables: GetWorkbookQueryVariables; skip?: boolean; } | { skip: boolean; }) ) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
      }
export function useGetWorkbookLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
        }
export function useGetWorkbookSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetWorkbookQuery, GetWorkbookQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetWorkbookQuery, GetWorkbookQueryVariables>(GetWorkbookDocument, options);
        }
export type GetWorkbookQueryHookResult = ReturnType<typeof useGetWorkbookQuery>;
export type GetWorkbookLazyQueryHookResult = ReturnType<typeof useGetWorkbookLazyQuery>;
export type GetWorkbookSuspenseQueryHookResult = ReturnType<typeof useGetWorkbookSuspenseQuery>;
export type GetWorkbookQueryResult = Apollo.QueryResult<GetWorkbookQuery, GetWorkbookQueryVariables>;
export const GetWorkbooksDocument = gql`
    query GetWorkbooks {
  workbooks {
    _id
    name
    sheetsCount
  }
}
    `;

/**
 * __useGetWorkbooksQuery__
 *
 * To run a query within a React component, call `useGetWorkbooksQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetWorkbooksQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetWorkbooksQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetWorkbooksQuery(baseOptions?: Apollo.QueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
      }
export function useGetWorkbooksLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
        }
export function useGetWorkbooksSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetWorkbooksQuery, GetWorkbooksQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetWorkbooksQuery, GetWorkbooksQueryVariables>(GetWorkbooksDocument, options);
        }
export type GetWorkbooksQueryHookResult = ReturnType<typeof useGetWorkbooksQuery>;
export type GetWorkbooksLazyQueryHookResult = ReturnType<typeof useGetWorkbooksLazyQuery>;
export type GetWorkbooksSuspenseQueryHookResult = ReturnType<typeof useGetWorkbooksSuspenseQuery>;
export type GetWorkbooksQueryResult = Apollo.QueryResult<GetWorkbooksQuery, GetWorkbooksQueryVariables>;
export const AddWorkbookDocument = gql`
    mutation AddWorkbook($name: String!) {
  addWorkbook(name: $name) {
    _id
    name
  }
}
    `;
export type AddWorkbookMutationFn = Apollo.MutationFunction<AddWorkbookMutation, AddWorkbookMutationVariables>;

/**
 * __useAddWorkbookMutation__
 *
 * To run a mutation, you first call `useAddWorkbookMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useAddWorkbookMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [addWorkbookMutation, { data, loading, error }] = useAddWorkbookMutation({
 *   variables: {
 *      name: // value for 'name'
 *   },
 * });
 */
export function useAddWorkbookMutation(baseOptions?: Apollo.MutationHookOptions<AddWorkbookMutation, AddWorkbookMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<AddWorkbookMutation, AddWorkbookMutationVariables>(AddWorkbookDocument, options);
      }
export type AddWorkbookMutationHookResult = ReturnType<typeof useAddWorkbookMutation>;
export type AddWorkbookMutationResult = Apollo.MutationResult<AddWorkbookMutation>;
export type AddWorkbookMutationOptions = Apollo.BaseMutationOptions<AddWorkbookMutation, AddWorkbookMutationVariables>;
export const GetProfileDocument = gql`
    query GetProfile {
  me {
    _id
    isAdmin
    email
    name
  }
}
    `;

/**
 * __useGetProfileQuery__
 *
 * To run a query within a React component, call `useGetProfileQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProfileQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProfileQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetProfileQuery(baseOptions?: Apollo.QueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
      }
export function useGetProfileLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
        }
export function useGetProfileSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
        }
export type GetProfileQueryHookResult = ReturnType<typeof useGetProfileQuery>;
export type GetProfileLazyQueryHookResult = ReturnType<typeof useGetProfileLazyQuery>;
export type GetProfileSuspenseQueryHookResult = ReturnType<typeof useGetProfileSuspenseQuery>;
export type GetProfileQueryResult = Apollo.QueryResult<GetProfileQuery, GetProfileQueryVariables>;
export const GetConfigDocument = gql`
    query GetConfig {
  config {
    OLIMANAGER_URL
  }
}
    `;

/**
 * __useGetConfigQuery__
 *
 * To run a query within a React component, call `useGetConfigQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetConfigQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetConfigQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetConfigQuery(baseOptions?: Apollo.QueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
      }
export function useGetConfigLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
        }
export function useGetConfigSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetConfigQuery, GetConfigQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetConfigQuery, GetConfigQueryVariables>(GetConfigDocument, options);
        }
export type GetConfigQueryHookResult = ReturnType<typeof useGetConfigQuery>;
export type GetConfigLazyQueryHookResult = ReturnType<typeof useGetConfigLazyQuery>;
export type GetConfigSuspenseQueryHookResult = ReturnType<typeof useGetConfigSuspenseQuery>;
export type GetConfigQueryResult = Apollo.QueryResult<GetConfigQuery, GetConfigQueryVariables>;
export const GetUsersDocument = gql`
    query GetUsers {
  users {
    _id
    email
    isAdmin
  }
}
    `;

/**
 * __useGetUsersQuery__
 *
 * To run a query within a React component, call `useGetUsersQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUsersQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUsersQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetUsersQuery(baseOptions?: Apollo.QueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
      }
export function useGetUsersLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
        }
export function useGetUsersSuspenseQuery(baseOptions?: Apollo.SkipToken | Apollo.SuspenseQueryHookOptions<GetUsersQuery, GetUsersQueryVariables>) {
          const options = baseOptions === Apollo.skipToken ? baseOptions : {...defaultOptions, ...baseOptions}
          return Apollo.useSuspenseQuery<GetUsersQuery, GetUsersQueryVariables>(GetUsersDocument, options);
        }
export type GetUsersQueryHookResult = ReturnType<typeof useGetUsersQuery>;
export type GetUsersLazyQueryHookResult = ReturnType<typeof useGetUsersLazyQuery>;
export type GetUsersSuspenseQueryHookResult = ReturnType<typeof useGetUsersSuspenseQuery>;
export type GetUsersQueryResult = Apollo.QueryResult<GetUsersQuery, GetUsersQueryVariables>;


export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Config: ResolverTypeWrapper<Config>;
  Data: ResolverTypeWrapper<Scalars['Data']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<{}>;
  ObjectId: ResolverTypeWrapper<ObjectId>;
  Permission: ResolverTypeWrapper<Omit<Permission, 'userId'> & { userId?: Maybe<ResolversTypes['ObjectId']> }>;
  PermissionInput: PermissionInput;
  Query: ResolverTypeWrapper<{}>;
  Row: ResolverTypeWrapper<Omit<Row, '_id'> & { _id: ResolversTypes['ObjectId'] }>;
  ScanJob: ResolverTypeWrapper<Omit<ScanJob, '_id' | 'ownerId' | 'sheetId'> & { _id: ResolversTypes['ObjectId'], ownerId: ResolversTypes['ObjectId'], sheetId: ResolversTypes['ObjectId'] }>;
  ScanMessage: ResolverTypeWrapper<ScanMessage>;
  ScanResults: ResolverTypeWrapper<Omit<ScanResults, '_id' | 'jobId'> & { _id: ResolversTypes['ObjectId'], jobId: ResolversTypes['ObjectId'] }>;
  Sheet: ResolverTypeWrapper<Omit<Sheet, '_id' | 'ownerId'> & { _id: ResolversTypes['ObjectId'], ownerId: ResolversTypes['ObjectId'] }>;
  SheetInput: SheetInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Timestamp: ResolverTypeWrapper<Scalars['Timestamp']['output']>;
  User: ResolverTypeWrapper<Omit<User, '_id'> & { _id: ResolversTypes['ObjectId'] }>;
  Workbook: ResolverTypeWrapper<Omit<Workbook, '_id' | 'ownerId'> & { _id?: Maybe<ResolversTypes['ObjectId']>, ownerId?: Maybe<ResolversTypes['ObjectId']> }>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  Config: Config;
  Data: Scalars['Data']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: {};
  ObjectId: ObjectId;
  Permission: Omit<Permission, 'userId'> & { userId?: Maybe<ResolversParentTypes['ObjectId']> };
  PermissionInput: PermissionInput;
  Query: {};
  Row: Omit<Row, '_id'> & { _id: ResolversParentTypes['ObjectId'] };
  ScanJob: Omit<ScanJob, '_id' | 'ownerId' | 'sheetId'> & { _id: ResolversParentTypes['ObjectId'], ownerId: ResolversParentTypes['ObjectId'], sheetId: ResolversParentTypes['ObjectId'] };
  ScanMessage: ScanMessage;
  ScanResults: Omit<ScanResults, '_id' | 'jobId'> & { _id: ResolversParentTypes['ObjectId'], jobId: ResolversParentTypes['ObjectId'] };
  Sheet: Omit<Sheet, '_id' | 'ownerId'> & { _id: ResolversParentTypes['ObjectId'], ownerId: ResolversParentTypes['ObjectId'] };
  SheetInput: SheetInput;
  String: Scalars['String']['output'];
  Timestamp: Scalars['Timestamp']['output'];
  User: Omit<User, '_id'> & { _id: ResolversParentTypes['ObjectId'] };
  Workbook: Omit<Workbook, '_id' | 'ownerId'> & { _id?: Maybe<ResolversParentTypes['ObjectId']>, ownerId?: Maybe<ResolversParentTypes['ObjectId']> };
};

export type ConfigResolvers<ContextType = any, ParentType extends ResolversParentTypes['Config'] = ResolversParentTypes['Config']> = {
  OLIMANAGER_URL?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface DataScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Data'], any> {
  name: 'Data';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addRow?: Resolver<Maybe<ResolversTypes['Row']>, ParentType, ContextType, RequireFields<MutationAddRowArgs, 'data' | 'sheetId'>>;
  addRows?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType, RequireFields<MutationAddRowsArgs, 'columns' | 'rows' | 'sheetId'>>;
  addSheet?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType, RequireFields<MutationAddSheetArgs, 'name' | 'schema' | 'workbookId'>>;
  addSheets?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationAddSheetsArgs, 'sheets'>>;
  addWorkbook?: Resolver<Maybe<ResolversTypes['Workbook']>, ParentType, ContextType, RequireFields<MutationAddWorkbookArgs, 'name'>>;
  closeSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationCloseSheetArgs, '_id'>>;
  deleteAllRows?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType, RequireFields<MutationDeleteAllRowsArgs, 'sheetId'>>;
  deleteRow?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType, RequireFields<MutationDeleteRowArgs, '_id'>>;
  deleteScan?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteScanArgs, 'jobId'>>;
  deleteSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteSheetArgs, '_id'>>;
  deleteSheets?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteSheetsArgs, 'ids'>>;
  deleteWorkbook?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType, RequireFields<MutationDeleteWorkbookArgs, '_id'>>;
  lockSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLockSheetArgs, '_id'>>;
  openSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationOpenSheetArgs, '_id'>>;
  patchRow?: Resolver<Maybe<ResolversTypes['Row']>, ParentType, ContextType, RequireFields<MutationPatchRowArgs, '_id' | 'data' | 'updatedOn'>>;
  unlockSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUnlockSheetArgs, '_id'>>;
  updateSheet?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUpdateSheetArgs, '_id'>>;
};

export interface ObjectIdScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['ObjectId'], any> {
  name: 'ObjectId';
}

export type PermissionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Permission'] = ResolversParentTypes['Permission']> = {
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  role?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  appInstance?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  config?: Resolver<Maybe<ResolversTypes['Config']>, ParentType, ContextType>;
  hello?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  olimanager?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rows?: Resolver<Array<ResolversTypes['Row']>, ParentType, ContextType, RequireFields<QueryRowsArgs, 'sheetId'>>;
  scanJobs?: Resolver<Array<ResolversTypes['ScanJob']>, ParentType, ContextType, RequireFields<QueryScanJobsArgs, 'sheetId'>>;
  scanResults?: Resolver<Array<ResolversTypes['ScanResults']>, ParentType, ContextType, RequireFields<QueryScanResultsArgs, 'jobId'>>;
  sheet?: Resolver<Maybe<ResolversTypes['Sheet']>, ParentType, ContextType, RequireFields<QuerySheetArgs, 'sheetId'>>;
  sheets?: Resolver<Array<ResolversTypes['Sheet']>, ParentType, ContextType, Partial<QuerySheetsArgs>>;
  users?: Resolver<Maybe<Array<Maybe<ResolversTypes['User']>>>, ParentType, ContextType>;
  workbook?: Resolver<Maybe<ResolversTypes['Workbook']>, ParentType, ContextType, RequireFields<QueryWorkbookArgs, 'workbookId'>>;
  workbooks?: Resolver<Maybe<Array<Maybe<ResolversTypes['Workbook']>>>, ParentType, ContextType>;
};

export type RowResolvers<ContextType = any, ParentType extends ResolversParentTypes['Row'] = ResolversParentTypes['Row']> = {
  _id?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['Data'], ParentType, ContextType>;
  isValid?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updatedOn?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanJobResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanJob'] = ResolversParentTypes['ScanJob']> = {
  _id?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  messages?: Resolver<Array<ResolversTypes['ScanMessage']>, ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  sheetId?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanMessageResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanMessage'] = ResolversParentTypes['ScanMessage']> = {
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Timestamp'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ScanResultsResolvers<ContextType = any, ParentType extends ResolversParentTypes['ScanResults'] = ResolversParentTypes['ScanResults']> = {
  _id?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  jobId?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  rawData?: Resolver<ResolversTypes['Data'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SheetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Sheet'] = ResolversParentTypes['Sheet']> = {
  _id?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  closed?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  closedBy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  closedOn?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  commonData?: Resolver<ResolversTypes['Data'], ParentType, ContextType>;
  locked?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  lockedBy?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lockedOn?: Resolver<Maybe<ResolversTypes['Timestamp']>, ParentType, ContextType>;
  nRows?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  permissions?: Resolver<Array<ResolversTypes['Permission']>, ParentType, ContextType>;
  schema?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  workbook?: Resolver<ResolversTypes['Workbook'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface TimestampScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Timestamp'], any> {
  name: 'Timestamp';
}

export type UserResolvers<ContextType = any, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  _id?: Resolver<ResolversTypes['ObjectId'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isAdmin?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uid?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WorkbookResolvers<ContextType = any, ParentType extends ResolversParentTypes['Workbook'] = ResolversParentTypes['Workbook']> = {
  _id?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<Maybe<ResolversTypes['ObjectId']>, ParentType, ContextType>;
  sheetsCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Config?: ConfigResolvers<ContextType>;
  Data?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  ObjectId?: GraphQLScalarType;
  Permission?: PermissionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Row?: RowResolvers<ContextType>;
  ScanJob?: ScanJobResolvers<ContextType>;
  ScanMessage?: ScanMessageResolvers<ContextType>;
  ScanResults?: ScanResultsResolvers<ContextType>;
  Sheet?: SheetResolvers<ContextType>;
  Timestamp?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
  Workbook?: WorkbookResolvers<ContextType>;
};

