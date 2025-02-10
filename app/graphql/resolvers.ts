import { getDb } from '@/app/lib/mongodb';
import { getUsersCollection, getSheetsCollection, getRowsCollection } from '@/app/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';
import { schemas, AvailableSchemas } from '@/app/lib/schema';
import { ObjectIdType, Timestamp } from './types';
import { Info } from '@/app/lib/models'

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    me: async (_:unknown, __: unknown, context: Context) => {
      const {user_id} = context 
      if (user_id) {
        const users = await getUsersCollection();
        const user = await users.findOne({ _id: user_id });
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

    rows: async (_: unknown, { sheet_id }: { sheet_id: ObjectId }/*, context: Context*/) => {
        const collection = await getRowsCollection();
        const results = await collection.find({sheet_id}).toArray();
        return results.map(doc => ({
            _id: doc._id,
            is_valid: doc.is_valid,
            updatedOn: doc.updatedOn,
            cognome: doc.cognome || '',
            nome: doc.nome || '',
            classe: doc.classe || '',
            sezione: doc.sezione || '',
            scuola: doc.scuola || '',
            data_nascita: doc.data_nascita || '',
            risposte: Array.isArray(doc.risposte)? doc.risposte : ['','','','','','','','','','','','','','','','','','','',''],
          }));  
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
        sheet_id: ObjectId,
        risposte: string[] 
      }, context: Context) => {
      const sheetsCollection = await getSheetsCollection();
      const sheet = await sheetsCollection.findOne({_id: payload.sheet_id})
      if (!sheet) throw Error(`invalid sheet_id ${payload.sheet_id}`)
      const schema = schemas[sheet.schema]
      const rowsCollection = await getRowsCollection();
      const createdOn = new Date();
      const updatedOn = createdOn;
      const createdBy = context.user_id;
      const updatedBy = createdBy;
      // TODO: check if user can write to sheet_id
      const cleaned = schema.clean(payload)
      const is_valid = schema.isValid(cleaned); // TODO compute this!
      const punti = schema.computeScore(cleaned);
      const result = await rowsCollection.insertOne({ 
        ...cleaned, 
        sheet_id: payload.sheet_id, 
        is_valid, 
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
      const sheet = await sheetsCollection.findOne({_id: row.sheet_id})
      if (!sheet) throw new Error('Sheet not found')
      const schema = schemas[sheet.schema]
      if (row.updatedOn && row.updatedOn.getTime() !== payload.updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      const cleaned = schema.clean(payload)
      const is_valid = schema.isValid(cleaned)
      const punti = schema.computeScore(cleaned)
      const $set = {
        ...cleaned,
        is_valid,
        punti,
        updatedOn: new Date(),
        updatedBy: context.user_id,
      }
      await rowsCollection.updateOne({ _id: payload._id }, { $set });
      return await rowsCollection.findOne({ _id: payload._id });
    },

    deleteRow: async (_: unknown, { _id }: { _id: ObjectId }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.deleteOne({ _id });
      return _id;
    },
  },

  Timestamp,
  ObjectId: ObjectIdType,
};

