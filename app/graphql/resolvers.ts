import { getDb } from '@/app/lib/mongodb';
import { getUsersCollection, getSheetsCollection, getRowsCollection } from '@/app/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';
import { AvailableSchemas } from '@/app/lib/schema';
import { ObjectIdType, Timestamp } from './types';

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

    addRow: async (_: unknown, { sheet_id, cognome, nome, classe, sezione, scuola, data_nascita, risposte }: { 
        sheet_id: ObjectId,
        cognome: string,
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] 
      }, context: Context) => {
      const collection = await getRowsCollection();
      const createdOn = new Date();
      const updatedOn = createdOn;
      const createdBy = context.user_id;
      const updatedBy = createdBy;
      // TODO: check if user can write to sheet_id
      const is_valid = false; // TODO compute this!
      const result = await collection.insertOne({ sheet_id, is_valid, updatedOn, updatedBy, createdOn, createdBy,
          cognome, nome, classe, sezione, scuola, data_nascita, risposte });
      return await collection.findOne({ _id: result.insertedId });
    },

    patchRow: async (_: unknown, { _id, updatedOn, cognome, nome, classe, sezione, scuola, data_nascita, risposte }: {
        _id: ObjectId,
        updatedOn: Date,
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }, context: Context) => {
      const collection = await getRowsCollection();
      const row = await collection.findOne({ _id });
      if (!row) throw new Error('Row not found');
      if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      const is_valid = false; // TODO compute this!
      const $set = {
        is_valid,
        cognome, nome, classe, sezione, scuola, data_nascita, risposte,
        updatedOn: new Date(),
        updatedBy: context.user_id,
      }
      await collection.updateOne({ _id: row._id }, { $set });
      return await collection.findOne({ _id });
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

