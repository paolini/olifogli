import olifogliWorkerStatus from './resolvers/olifogliWorkerStatus'
import omrWorkerStatus from './resolvers/omrWorkerStatus'
import { workerFiles, workerFileGroupFiles, deleteWorkerFiles, deleteWorkerFileGroup } from './resolvers/workerFiles'
import { appLogs, appLogAddedSubscription } from './resolvers/appLogs'
import { olimanagerVenueSheetChoices, prepareOlimanagerVenueSheets } from './resolvers/olimanagerVenueSheets'
import olimanagerJobsSubscription from './resolvers/olimanagerJobsSubscription'
import { requestOlimanagerCheck, requestOlimanagerMatch, requestOlimanagerResults, resumeOlimanagerCheck, olimanagerJobs, olimanagerActiveJobs, olimanagerJobItems } from './resolvers/olimanagerJobs'
import { Context } from './types'
import { ObjectId } from 'bson'
import { ObjectIdType, Timestamp, DataType } from './types'
import { GraphQLJSON } from "graphql-type-json"
import { Resolvers } from './generated'
import { getSheetsCollection } from '../lib/mongodb'

import { pubsub, TOPICS } from '../lib/pubsub'
import { get_authenticated_user } from './resolvers/utils'
import { withFilter } from 'graphql-subscriptions'
import sheetSubscription from './resolvers/sheetSubscription'

import users from './resolvers/users'
import workbooks from './resolvers/workbooks'
import workbook from './resolvers/workbook'
import workbookCommonData from './resolvers/workbookCommonData'
import sheets from './resolvers/sheets'
import sheet from './resolvers/sheet'
import rows from './resolvers/rows'
import scanJobs from './resolvers/scanJobs'
import scanSheetJobs from './resolvers/scanSheetJobs'
import scanResults from './resolvers/scanResults'
import workbookDistributionReport from './resolvers/workbookDistributionReport'
import workbookRankingReport from './resolvers/workbookRankingReport'
import settingsResolvers from './resolvers/settings'
import workbookTimeDistributionReport from './resolvers/workbookTimeDistributionReport'
import workbookAgeDistributionReport from './resolvers/workbookAgeDistributionReport'

import addSheet from './resolvers/addSheet'
import deleteSheet from './resolvers/deleteSheet'
import deleteSheets from './resolvers/deleteSheets'
import addSheets from './resolvers/addSheets'
import updateSheets from './resolvers/updateSheets'
import addRow from './resolvers/addRow'
import patchRow from './resolvers/patchRow'
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
import recountSheet from './resolvers/recountSheet'
import updateUserRole from './resolvers/updateUserRole'
import closeSheet from './resolvers/closeSheet'
import openSheet from './resolvers/openSheet'
import lockSheet from './resolvers/lockSheet'
import unlockSheet from './resolvers/unlockSheet'
import validateRows from './resolvers/validateRows'
import olimanagerCreateParticipant from './resolvers/olimanagerCreateParticipant'
import moveCursor from './resolvers/moveCursor'
import cursors from './resolvers/cursors'
import olimanagerBulkUpdateResults from './resolvers/olimanagerBulkUpdateResults'
import olimanagerUpdateExtraFieldsResults from './resolvers/olimanagerUpdateExtraFields'
import workbookExerciseReport from './resolvers/workbookExerciseReport'
import createSheets from './resolvers/createSheets'
import cryptSheets from './resolvers/cryptSheets'
import decryptSheets from './resolvers/decryptSheets'

// Definizione dei resolver
export const resolvers: Resolvers = {
  Query: {
    olimanagerVenueSheetChoices,
    olifogliWorkerStatus,
    omrWorkerStatus,
    olimanagerJobs,
    olimanagerActiveJobs,
    workerFiles,
    workerFileGroupFiles,
    appLogs,
    olimanagerJobItems,
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
    workbookDistributionReport,
    workbookRankingReport,
    workbookExerciseReport,
    workbookTimeDistributionReport,
    workbookAgeDistributionReport,
    getSetting: settingsResolvers.Query.getSetting,
    cursors,
  },

  Workbook: {
    commonData: workbookCommonData,
    sheetsCount: async (parent, _, context: Context) => {
      const user = await get_authenticated_user(context)
      if (!user) throw new Error("Not authenticated")
      if (!parent._id) return 0

      const collection = await getSheetsCollection()
      
      if (user.isAdmin || user.isSupervisor) {
        // Admin can see all sheets
        return await collection.countDocuments({ workbookId: parent._id })
      } else {
        // Regular user can only see sheets they have permissions for
        return await collection.countDocuments({
          workbookId: parent._id,
          'permissions.email': user.email,
        })
      }
    }
  },

  Mutation: {
    deleteWorkerFiles,
    deleteWorkerFileGroup,
    prepareOlimanagerVenueSheets,
    requestOlimanagerCheck,
    requestOlimanagerMatch,
    requestOlimanagerResults,
    resumeOlimanagerCheck,
    addSheet,
    deleteSheet,
    deleteSheets,
    addSheets,
    updateSheets,

    addRow,
    patchRow,
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
    recountSheet,
    updateUserRole,
    closeSheet,
    openSheet,
    lockSheet,
    unlockSheet,
    validateRows,
    createSheets,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    olimanagerCreateParticipant: olimanagerCreateParticipant as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    olimanagerBulkUpdateResults: olimanagerBulkUpdateResults as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    olimanagerUpdateExtraFields: olimanagerUpdateExtraFieldsResults as any,
    cryptSheets: cryptSheets, 
    decryptSheets: decryptSheets,
    updateSetting: settingsResolvers.Mutation.updateSetting,
    moveCursor,
  },

  Subscription: {
    olimanagerJobsUpdated: { subscribe: olimanagerJobsSubscription },
    appLogAdded: { subscribe: appLogAddedSubscription },
    sheetUpdated: {
      subscribe: sheetSubscription(TOPICS.SHEET_UPDATED),
    },
    rowChanged: {
      subscribe: sheetSubscription(TOPICS.ROW_CHANGED),
    },
    rowsDeleted: {
      subscribe: sheetSubscription(TOPICS.ROWS_DELETED),
    },
    cursorChanged: {
      subscribe: sheetSubscription(TOPICS.CURSOR_CHANGED),
    },
    workbookUpdated: {
      subscribe: withFilter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_: any, args: any) => pubsub.asyncIterator(TOPICS.WORKBOOK_UPDATED((args.workbookId as ObjectId).toString())),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any, _variables: any, context: Context | undefined) => {
          if (!context) return false
          if (context.isAdmin || context.isSupervisor) return true
          // Payloads come from workbookUpdatedPayload; anything else is denied.
          const allowedEmails = payload._allowedEmails as string[] | undefined
          return !!context.email && Array.isArray(allowedEmails) && allowedEmails.includes(context.email)
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any,
    },
    scanJobUpdated: {
      subscribe: sheetSubscription(TOPICS.SCAN_JOB_UPDATED, { scanJobUpdated: false }),
    },
    scanSheetJobUpdated: {
      subscribe: sheetSubscription(TOPICS.SCAN_SHEET_JOB_UPDATED, { scanSheetJobUpdated: false }),
    },
  },

  Timestamp,
  ObjectId: ObjectIdType,
  JSON: GraphQLJSON,
  Data: DataType,
}
