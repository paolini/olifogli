import { getDb } from '@/lib/mongodb';
import { getUsers, getSheets, getRows } from '@/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';
import { GraphQLScalarType, Kind, ValueNode } from "graphql";

const Timestamp = new GraphQLScalarType({
  name: "Timestamp",
  description: "A custom scalar for timestamps",
  
  parseValue(value: unknown): Date | null {
    if (typeof value === "number") return new Date(value); // Se è un numero, lo converte in Date
    if (typeof value === "string") return new Date(value); // Se è una stringa ISO, lo converte in Date
    return null; // Se non è un valore valido, ritorna null
  },

  serialize(value: unknown): string | null {
    if (value instanceof Date) return value.toISOString(); // Converte in stringa ISO
    return null; // Se non è una data valida, ritorna null
  },

  parseLiteral(ast: ValueNode): Date | null {
    if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return new Date(parseInt(ast.value, 10)); // Converte un numero in Date
    }
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value); // Converte una stringa ISO in Date
    }
    return null; // Se il tipo non è supportato, ritorna null
  }
});

const ObjectIdType = new GraphQLScalarType({
  name: "ObjectId",
  description: "A custom scalar for MongoDB ObjectID",
  
  parseValue(value: unknown): ObjectId {
    switch(typeof value) {
      case "string":
      case "number":
        return new ObjectId(value); // Converte in ObjectId
      case "object":
        if (value instanceof ObjectId) return value; // Se è già un ObjectId, lo ritorna
      default:
        throw new Error("ObjectId must be a 24 digit hex string or a 12 byte Buffer");
    }
  },

  serialize(value: unknown): string {
    if (value instanceof ObjectId) return value.toString(); // Converte in stringa
    throw new Error("ObjectId expected");
  },

  parseLiteral(ast: ValueNode): ObjectId {
    if (ast.kind === Kind.STRING) {
      return new ObjectId(ast.value); // Converte in ObjectId
    }
    throw new Error("ObjectId must be a 24 digit hex string");
  }
});

// Definizione dei resolver
export const resolvers = {
  Query: {
    hello: () => 'Hello, world!',

    me: async (_:unknown, __: unknown, context: Context) => {
      const {user_id} = context 
      if (user_id) {
        const users = await getUsers();
        const user = await users.findOne({ _id: user_id });
        return user
      } else return null
    },

    sheets: async () => {
      const collection = await getSheets();
      return await collection.find({}).toArray();
    },

    data: async () => {
        const collection = await getRows();
        const results = await collection.find({}).toArray();
        return results.map(doc => ({
            _id: doc._id,
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
    addSheet: async (_: unknown, { name, schema, params }: { name: string, schema: string, params: string }) => {
      const collection = await getSheets();
      const result = await collection.insertOne({ name, schema, params });
      return await collection.findOne({ _id: result.insertedId });
    },

    deleteSheet: async (_: unknown, { _id }: { _id: ObjectId }) => {
      const collection = await getSheets();
      await collection.deleteOne({ _id });
      return _id;
    },

    addRow: async (_: unknown, { cognome, nome, classe, sezione, scuola, data_nascita, risposte }: { 
        cognome: string,
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] 
      }, context: Context) => {
      const collection = await getRows();
      const createdOn = new Date();
      const updatedOn = createdOn;
      const createdBy = context.user_id;
      const updatedBy = createdBy;
      const result = await collection.insertOne({ updatedOn, updatedBy, createdOn, createdBy,
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
      const collection = await getRows();
      const row = await collection.findOne({ _id });
      if (!row) throw new Error('Row not found');
      if (row.updatedOn && row.updatedOn.getTime() !== updatedOn.getTime()) throw new Error(`La riga è stata modificata da qualcun altro`);
      const $set = {
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

