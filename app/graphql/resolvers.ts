import { getUsersCollection, getSheetsCollection, getRowsCollection, getScansCollection, getScanResultsCollection } from '@/app/lib/mongodb'
import { ObjectId, WithId, WithoutId } from 'mongodb';
import { Context } from './types';
import { schemas, AvailableSchemas } from '@/app/lib/schema';
import { ObjectIdType, Timestamp } from './types';
import { Data, Row } from '@/app/lib/models';
import { GraphQLJSON } from "graphql-type-json";

import { test } from '@/app/lib/olimanager'
import { User, Sheet } from '@/app/lib/models'

// TODO: check permissions!!

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    config: async () => {
      return {
        OLIMANAGER_URL: process.env.OLIMANAGER_URL,
      }
    },

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

    scans: async (_: unknown, { sheetId }: { sheetId: ObjectId }, context: Context) => {
      const user = await get_authenticated_user(context)
      const sheets = await getSheetsCollection()
      const sheet = await sheets.findOne({_id: sheetId })
      check_user_can_edit_sheet(user, sheet)
      const collection = await getScansCollection();
      const results = await collection.aggregate([
        { $match: { sheetId } },
        { $sort: { jobId: 1, timestamp: -1 } },
        { $group: {
          _id: "$jobId",
          lastScan: { $first: "$$ROOT" }
        }},
        { $replaceRoot: { newRoot: "$lastScan" } },
        { $sort: { timestamp: -1 } },
      ])
      return results.toArray();
    },

    scanResults: async (_: unknown, { sheetId, jobId }: { sheetId: ObjectId, jobId: string }, context: Context) => {
      const user = await get_authenticated_user(context)
      const sheets = await getSheetsCollection()
      const sheet = await sheets.findOne({_id: sheetId })
      check_user_can_edit_sheet(user, sheet)
      const collection = await getScanResultsCollection();
      const results = await collection.aggregate([
        { $match: { sheetId, jobId } },
      ]);
      return results.toArray();
    },

    olimanager: async (_: unknown) => {
        return await test()
    },

  },

  Mutation: {
    addSheet: async (_: unknown, { name, schema, params }: 
        { name: string, 
          schema: AvailableSchemas, 
          params: string }, 
        context: Context) => {
      const user = await get_authenticated_user(context)
      check_admin(user)
      const collection = await getSheetsCollection()
      const result = await collection.insertOne({ name, schema, params, owner_id: user._id })
      return await collection.findOne({ _id: result.insertedId })
    },

    deleteSheet: async (_: unknown, { _id }: { _id: ObjectId }, context: Context) => {
      const user = await get_authenticated_user(context)
      check_admin(user)
      const sheets = await getSheetsCollection();
      await sheets.deleteOne({_id})
      return _id;
    },

    addRow: async (_: unknown, {sheetId, data}: {sheetId: ObjectId, data: Data}, context: Context) => {
      const user = await get_authenticated_user(context)
      const sheetsCollection = await getSheetsCollection()
      const sheet = await sheetsCollection.findOne({_id: sheetId})
      check_user_can_edit_sheet(user, sheet)
      const schema = schemas[sheet.schema]
      const createdOn = new Date()
      const updatedOn = createdOn
      const createdBy = user._id
      const updatedBy = user._id
      // TODO: check if user can write to sheetId
      data = schema.clean(data)
      const isValid = schema.isValid(data) // TODO compute this!
      const rowsCollection = await getRowsCollection()
      const result = await rowsCollection.insertOne({ 
        data, 
        sheetId, 
        isValid, 
        updatedOn, updatedBy, createdOn, createdBy,
       });
      return await rowsCollection.findOne({ _id: result.insertedId });
    },

    patchRow: async (_: unknown, {_id, updatedOn, data}: {
        _id: ObjectId,
        updatedOn: Date,
        data: Data }, context: Context) => {
      const user = await get_authenticated_user(context)
      const rowsCollection = await getRowsCollection();
      const row = await rowsCollection.findOne({ _id });
      if (!row) throw new Error('Row not found');
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: row.sheetId})
      check_user_can_edit_sheet(user,sheet)
      const schema = schemas[sheet.schema]
      if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      data = schema.clean(data)
      const isValid = schema.isValid(data)
      const $set = {
        data,
        isValid,
        updatedOn: new Date(),
        updatedBy: user._id,
      }
      await rowsCollection.updateOne({ _id }, { $set })
      return await rowsCollection.findOne({ _id })
    },

    deleteRow: async (_: unknown, { _id }: { _id: ObjectId }, context: Context) => {
      const user = await get_authenticated_user(context)
      const rowsCollection = await getRowsCollection()
      const row = await rowsCollection.findOne({ _id })
      if (!row) throw new Error('Row not found')
      const sheetsCollection = await getSheetsCollection()
      const sheet = await sheetsCollection.findOne({_id: row.sheetId})
      check_user_can_edit_sheet(user,sheet)
      const collection = await getRowsCollection() 
      await collection.deleteOne({ _id });
      return _id;
    },

    addRows: async (_: unknown, {sheetId, columns, rows}: { 
      sheetId: ObjectId,
      columns: string[],
      nAnswers: number,
      rows: string[][]
    }, context: Context) => {
      const user = await get_authenticated_user(context)
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: sheetId})
      check_user_can_edit_sheet(user, sheet)
      const schema = schemas[sheet.schema]
      const createdOn = new Date()
      const createdBy = user._id
      const updatedOn = createdOn
      const updatedBy = createdBy
      const objectRows = rows.map(row => ({
          ...Object.fromEntries(columns.map((column,i)=>[column,row[i]]))}))
      const validatedRows: WithoutId<Row>[] = objectRows
        .map(row => schema.clean(row as Data))
        .map(data => ({
          data, 
          isValid: schema.isValid(data),
          sheetId,
          createdBy,
          createdOn,
          updatedBy,
          updatedOn,
          }))
      const collection = await getRowsCollection();
      const res = await collection.insertMany(validatedRows);
      return res.insertedCount;
    }

  },

  Timestamp,
  ObjectId: ObjectIdType,
  JSON: GraphQLJSON,
};

function check_authenticated({user_id}: Context): ObjectId {
  if (!user_id) throw Error('autenticazione richiesta')
  return user_id
}

function check_admin(user: WithId<User>) {
  if (!user?.is_admin) throw Error('non autorizzato')
}

async function get_authenticated_user(context: Context) {
  const user_id = check_authenticated(context)
  const users = await getUsersCollection()
  const user = await users.findOne({ _id: user_id })
  if (!user) throw Error(`utente non trovato ${user_id}`)
  return user
}

function check_user_can_edit_sheet(user: WithId<User>, sheet: Sheet|null): asserts sheet is NonNullable<Sheet> {
  if (!sheet) throw Error('foglio inesistente')
  if (user?.is_admin) return
  if (!sheet.owner_id.equals(user._id)) throw Error('non autorizzato')
}

