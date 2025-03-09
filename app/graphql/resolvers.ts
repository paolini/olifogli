import { getUsersCollection, getSheetsCollection, getRowsCollection, getScansCollection, Row } from '@/app/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';
import { schemas, AvailableSchemas } from '@/app/lib/schema';
import { ObjectIdType, Timestamp } from './types';
import { Data } from '@/app/lib/models';
import { GraphQLJSON } from "graphql-type-json";

import { test } from '@/app/lib/olimanager';

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

    sheet: async (_: unknown, { sheetId }: { sheetId: ObjectId }) => {
      const collection = await getSheetsCollection();
      return await collection.findOne({ _id: sheetId });
    },

    rows: async (_: unknown, { sheetId }: { sheetId: ObjectId }/*, context: Context*/) => {
        const collection = await getRowsCollection();
        const results = await collection.find({sheetId}).toArray();
        return results
    },

    scans: async (_: unknown, { sheetId }: { sheetId: ObjectId }) => {
      const collection = await getScansCollection();
      const results = await collection.aggregate([
        { $match: { sheetId } },
        { $sort: { jobId: 1, timestamp: -1 } },
        { $group: {
          _id: "$jobId",
          lastScan: { $first: "$$ROOT" }
        }},
        { $replaceRoot: { newRoot: "$lastScan" } }
      ])
      return results.toArray();
    },

    olimanager: async (_: unknown) => {
        return await test()
    },

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

    addRow: async (_: unknown, {sheetId, data}: {sheetId: ObjectId, data: Data}, context: Context) => {
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: sheetId})
      if (!sheet) throw Error(`invalid sheetId ${sheetId}`)
      const schema = schemas[sheet.schema]
      const createdOn = new Date();
      const updatedOn = createdOn;
      const createdBy = context.userId;
      const updatedBy = createdBy;
      // TODO: check if user can write to sheetId
      data = schema.clean(data)
      const isValid = schema.isValid(data); // TODO compute this!
      const rowsCollection = await getRowsCollection();
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
      const rowsCollection = await getRowsCollection();
      const row = await rowsCollection.findOne({ _id });
      if (!row) throw new Error('Row not found');
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: row.sheetId})
      if (!sheet) throw new Error('Sheet not found')
      const schema = schemas[sheet.schema]
      if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      data = schema.clean(data)
      const isValid = schema.isValid(data)
      const $set = {
        data,
        isValid,
        updatedOn: new Date(),
        updatedBy: context.userId,
      }
      await rowsCollection.updateOne({ _id }, { $set });
      return await rowsCollection.findOne({ _id });
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
          ...Object.fromEntries(columns.map((column,i)=>[column,row[i]]))}))
      const validatedRows: Row[] = objectRows
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

