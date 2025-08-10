import { Context } from './types'
import { ObjectIdType, Timestamp, DataType } from './types'
import { GraphQLJSON } from "graphql-type-json"
import { Resolvers } from './generated'

import { get_authenticated_user } from './resolvers/utils'

import users from './resolvers/users'
import workbooks from './resolvers/workbooks'
import workbook from './resolvers/workbook'
import sheets from './resolvers/sheets'
import sheet from './resolvers/sheet'
import rows from './resolvers/rows'
import scanJobs from './resolvers/scanJobs'
import scanResults from './resolvers/scanResults'

import addSheet from './resolvers/addSheet'
import deleteSheet from './resolvers/deleteSheet'
import addRow from './resolvers/addRow'
import patchRow from './resolvers/patchRow'
import deleteRow from './resolvers/deleteRow'
import addRows from './resolvers/addRows'
import deleteScan from './resolvers/deleteScan'

// Definizione dei resolver
export const resolvers: Resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    config: async () => ({ OLIMANAGER_URL: process.env.OLIMANAGER_URL }),

    me: async (_:unknown, __: unknown, context: Context) => {
      if (!context?.user_id) return null // no throw if not authenticated
      const user = await get_authenticated_user(context)
      return user
    },
    users,
    workbooks,
    workbook,
    sheets,
    sheet,
    rows,
    scanJobs,
    scanResults,
  },

  Mutation: {
    addSheet,
    deleteSheet,

    addRow,
    patchRow,
    deleteRow,
    addRows,
    deleteScan,
  },

  Timestamp,
  ObjectId: ObjectIdType,
  JSON: GraphQLJSON,
  Data: DataType,
}