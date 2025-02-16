import { getDb } from '@/app/lib/mongodb';
import { getUsersCollection, getSheetsCollection, getRowsCollection, Row } from '@/app/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';
import { schemas, AvailableSchemas } from '@/app/lib/schema';
import { ObjectIdType, Timestamp } from './types';
import { Info } from '@/app/lib/models'

import { test } from '@/app/lib/olimanager';

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    me: async (_:unknown, __: unknown, context: Context) => {
      const {userId} = context 
      if (userId) {
        const users = await getUsersCollection();
        const user = await users.findOne({ _id: userId });
        return user
      } else return null
    },

    sheets: async () => {
      const collection = await getSheetsCollection();
      return await collection.find({}).toArray();
    },

    sheet: async (_: unknown, { _id }: { _id: ObjectId }) => {
      const collection = await getSheetsCollection();
      return await collection.findOne({ _id });
    },

    rows: async (_: unknown, { sheetId }: { sheetId: ObjectId }/*, context: Context*/) => {
        const collection = await getRowsCollection();
        const results = await collection.find({sheetId}).toArray();
        return results
    }
  },

  Mutation: {
    addSheet: async (_: unknown, { name, schema, params }: { name: string, schema: AvailableSchemas, params: string }) => {
      const collection = await getSheetsCollection();
      const result = await collection.insertOne({ name, schema, params });
      return await collection.findOne({ _id: result.insertedId });
    },

    deleteSheet: async (_: unknown, { _id }: { _id: ObjectId }) => {
      const collection = await getSheetsCollection();
      await collection.deleteOne({ _id });
      return _id;
    },

    addRow: async (_: unknown, payload: Info & { 
        sheetId: ObjectId,
        risposte: string[] 
      }, context: Context) => {
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: payload.sheetId})
      if (!sheet) throw Error(`invalid sheetId ${payload.sheetId}`)
      const schema = schemas[sheet.schema]
      const createdOn = new Date();
      const updatedOn = createdOn;
      const createdBy = context.userId;
      const updatedBy = createdBy;
      // TODO: check if user can write to sheetId
      const cleaned = schema.clean(payload)
      const isValid = schema.isValid(cleaned); // TODO compute this!
      const punti = schema.computeScore(cleaned);
      const rowsCollection = await getRowsCollection();
      const result = await rowsCollection.insertOne({ 
        ...cleaned, 
        sheetId: payload.sheetId, 
        isValid, 
        punti,
        updatedOn, updatedBy, createdOn, createdBy,
       });
      return await rowsCollection.findOne({ _id: result.insertedId });
    },

    patchRow: async (_: unknown, payload: Info & {
        _id: ObjectId,
        updatedOn: Date,
        risposte: string[] }, context: Context) => {
      const rowsCollection = await getRowsCollection();
      const row = await rowsCollection.findOne({ _id: payload._id });
      if (!row) throw new Error('Row not found');
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: row.sheetId})
      if (!sheet) throw new Error('Sheet not found')
      const schema = schemas[sheet.schema]
      if (row.updatedOn && row.updatedOn.getTime() !== payload.updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      const cleaned = schema.clean(payload)
      const isValid = schema.isValid(cleaned)
      const punti = schema.computeScore(cleaned)
      const $set = {
        ...cleaned,
        isValid,
        punti,
        updatedOn: new Date(),
        updatedBy: context.userId,
      }
      await rowsCollection.updateOne({ _id: payload._id }, { $set });
      return await rowsCollection.findOne({ _id: payload._id });
    },

    deleteRow: async (_: unknown, { _id }: { _id: ObjectId }) => {
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
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: sheetId})
      if (!sheet) throw Error(`invalid sheetId ${sheetId}`)
      const schema = schemas[sheet.schema]
      const createdOn = new Date()
      const createdBy = context.userId;
      const updatedOn = createdOn
      const updatedBy = createdBy
      const objectRows = rows.map(row => ({
          ...Object.fromEntries(columns.map((column,i)=>[column,row[i]])),
          risposte: row.slice(columns.length)}))
      const validatedRows: Row[] = objectRows
        .map(row => schema.clean(row as Row))
        .map(row => ({
          ...row, 
          isValid: schema.isValid(row),
          punti: schema.computeScore(row), 
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
};

