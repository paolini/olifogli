import { Context } from './types'
import { ObjectIdType, Timestamp } from './types'
import { GraphQLJSON } from "graphql-type-json"

import { test } from '@/app/lib/olimanager'
import { get_authenticated_user } from './resolvers/utils'

import users from './resolvers/users'
import sheets from './resolvers/sheets'
import sheet from './resolvers/sheet'
import rows from './resolvers/rows'
import scans from './resolvers/scans'
import scanResults from './resolvers/scanResults'

import addSheet from './resolvers/addSheet'
import deleteSheet from './resolvers/deleteSheet'
import addRow from './resolvers/addRow'
import patchRow from './resolvers/patchRow'
import deleteRow from './resolvers/deleteRow'
import addRows from './resolvers/addRows'

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    config: async () => ({ OLIMANAGER_URL: process.env.OLIMANAGER_URL }),

    me: async (_:unknown, __: unknown, context: Context) => {
      if (!context?.user_id) return null // no throw if not authenticated
      const user = await get_authenticated_user(context)
      return user
    },
    users,
    sheets,
    sheet,
    rows,
    scans,
    scanResults,

    olimanager: async (_: unknown) => {
        return await test()
    },

  },

  Mutation: {
    addSheet,
    deleteSheet,

    addRow,
    patchRow,
    deleteRow,
    addRows
  },

  Timestamp,
  ObjectId: ObjectIdType,
  JSON: GraphQLJSON,
}