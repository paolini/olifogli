import { getUsersCollection, getSheetsCollection, getRowsCollection, getScansCollection, getScanResultsCollection } from '@/app/lib/mongodb'
import { ObjectId } from 'mongodb'
import { Context } from './types'
import { ObjectIdType, Timestamp } from './types'
import { GraphQLJSON } from "graphql-type-json"

import { test } from '@/app/lib/olimanager'
import { get_authenticated_user, check_admin, check_user_can_edit_sheet } from './resolvers/utils'

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

    users: async (_: unknown, __: unknown, context: Context) => {
      const user = await get_authenticated_user(context)
      check_admin(user)
      const collection = await getUsersCollection()
      return await collection.find({}).toArray()
    },

    sheets: async (_: unknown, {}, context: Context) => {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const match = user.is_admin ? {} : { owner_id: user._id }
      return await collection.find(match).toArray()
    },

    sheet: async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
      const user = await get_authenticated_user(context)
      const collection = await getSheetsCollection()
      const sheet = await collection.findOne({_id: sheetId})
      check_user_can_edit_sheet(user, sheet)
      return sheet
    },

    rows: async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
        const user = await get_authenticated_user(context)
        const sheets = await getSheetsCollection()
        const sheet = await sheets.findOne({_id: sheetId })
        check_user_can_edit_sheet(user, sheet)
        const rows = await getRowsCollection()
        const results = await rows.find({sheetId}).toArray()
        return results
    },

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