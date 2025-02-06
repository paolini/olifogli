import { getDb } from '@/lib/mongodb';
import { getUsers, getRows } from '@/lib/models';
import { ObjectId } from 'mongodb';
import { Context } from './types';

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
    data: async () => {
        const collection = await getRows();
        const results = await collection.find({}).toArray();
        return results.map(doc => ({
            _id: doc._id.toString(),
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
      const updatedOn = new Date();
      const updatedBy = context.user_id;
      const result = await collection.insertOne({ updatedOn, updatedBy, 
          cognome, nome, classe, sezione, scuola, data_nascita, risposte });
      return {
          _id: result.insertedId.toString(),
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      };
    },
    updateRow: async (_: unknown, { _id, cognome, nome, classe, sezione, scuola, data_nascita, risposte }: {
        _id: string,
        cognome: string, 
        nome: string, 
        classe: string, 
        sezione: string, 
        scuola: string, 
        data_nascita: string, 
        risposte: string[] }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.updateOne({ _id: new ObjectId(_id) }, { $set: { cognome, nome, classe, sezione, scuola, data_nascita, risposte } });
      return {
          _id,
          cognome,
          nome,
          classe,
          sezione,
          scuola,
          data_nascita,
          risposte,
      }
    },
    deleteRow: async (_: unknown, { _id }: { _id: string }) => {
      const db = await getDb();
      const collection = db.collection('rows');
      await collection.deleteOne({ _id: new ObjectId(_id) });
      return _id;
    },
  }
};
