import { Context } from './types'
import { ObjectIdType, Timestamp, DataType } from './types'
import { GraphQLJSON } from "graphql-type-json"
import { Resolvers } from './generated'
import { getSheetsCollection } from '../lib/mongodb'

import { get_authenticated_user } from './resolvers/utils'

import users from './resolvers/users'
import workbooks from './resolvers/workbooks'
import workbook from './resolvers/workbook'
import sheets from './resolvers/sheets'
import sheet from './resolvers/sheet'
import rows from './resolvers/rows'
import scanJobs from './resolvers/scanJobs'
import scanSheetJobs from './resolvers/scanSheetJobs'
import scanResults from './resolvers/scanResults'
import sheetsDistributionReport from './resolvers/sheetsDistributionReport'
import sheetsRankingReport from './resolvers/sheetsRankingReport'
import settingsResolvers from './resolvers/settings'
import sheetsTimeDistributionReport from './resolvers/sheetsTimeDistributionReport'
import sheetsAgeDistributionReport from './resolvers/sheetsAgeDistributionReport'

import addSheet from './resolvers/addSheet'
import deleteSheet from './resolvers/deleteSheet'
import deleteSheets from './resolvers/deleteSheets'
import addSheets from './resolvers/addSheets'
import updateSheets from './resolvers/updateSheets'
import addRow from './resolvers/addRow'
import patchRow from './resolvers/patchRow'
import toggleSelection from './resolvers/toggleSelection'
import deleteRow from './resolvers/deleteRow'
import deleteRows from './resolvers/deleteRows'
import deleteAllRows from './resolvers/deleteAllRows'
import addRows from './resolvers/addRows'
import deleteScan from './resolvers/deleteScan'
import requestScanSheetGeneration from './resolvers/requestScanSheetGeneration'
import addWorkbook from './resolvers/addWorkbook'
import deleteWorkbook from './resolvers/deleteWorkbook'
import updateWorkbook from './resolvers/updateWorkbook'
import updateSheet from './resolvers/updateSheet'
import updateUserRole from './resolvers/updateUserRole'
import closeSheet from './resolvers/closeSheet'
import openSheet from './resolvers/openSheet'
import lockSheet from './resolvers/lockSheet'
import unlockSheet from './resolvers/unlockSheet'
import validateRows from './resolvers/validateRows'
import olimanagerCreateParticipant from './resolvers/olimanagerCreateParticipant'
import olimanagerBulkUpdateResults from './resolvers/olimanagerBulkUpdateResults'
import sheetsExerciseReport from './resolvers/sheetsExerciseReport'

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
    scanSheetJobs,
    scanResults,
    sheetsDistributionReport,
    sheetsRankingReport,
    sheetsExerciseReport,
    sheetsTimeDistributionReport,
    sheetsAgeDistributionReport,
    appInstance: () => process.env.NEXT_PUBLIC_APP_INSTANCE || null,
    getSetting: settingsResolvers.Query.getSetting,
  },

  Workbook: {
    sheetsCount: async (parent, _, context: Context) => {
      const user = await get_authenticated_user(context)
      if (!user) throw new Error("Not authenticated")
      if (!parent._id) return 0

      const collection = await getSheetsCollection()
      
      if (user.isAdmin || user.isSupervisor) {
        // Admin can see all sheets
        return await collection.countDocuments({ workbookId: parent._id })
      } else {
        // Regular user can only see sheets they own or have permissions for
        return await collection.countDocuments({
          workbookId: parent._id,
          $or: [
            { ownerId: user._id },
            { 'permissions.email': user.email },
            { 'permissions.userId': user._id },
          ]
        })
      }
    }
  },

  Mutation: {
    addSheet,
    deleteSheet,
    deleteSheets,
    addSheets,
    updateSheets,

    addRow,
    patchRow,
    toggleSelection,
    deleteRow,
    deleteRows,
    deleteAllRows,
    addRows,
    deleteScan,
    requestScanSheetGeneration,
    addWorkbook,
    deleteWorkbook,
    updateWorkbook,
  updateSheet,
  updateUserRole,
    closeSheet,
    openSheet,
    lockSheet,
    unlockSheet,
    validateRows,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    olimanagerCreateParticipant: olimanagerCreateParticipant as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    olimanagerBulkUpdateResults: olimanagerBulkUpdateResults as any,
    updateSetting: settingsResolvers.Mutation.updateSetting,
  },

  Timestamp,
  ObjectId: ObjectIdType,
  JSON: GraphQLJSON,
  Data: DataType,
}