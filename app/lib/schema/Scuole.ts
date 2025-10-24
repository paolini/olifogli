import { Field } from './fields'
import Schema from './Schema'
import { Row } from '../models'

export default class Scuole extends Schema {
    constructor() {
        super('scuole', 'scuole e referenti', [
            new Field('Codice_meccanografico', {header: 'Codice meccanografico', alternativeNames: ['school_external_id']}),
            new Field('Nome_scuola', {header: 'Nome scuola', alternativeNames: ['school_name']}),
            new Field('Città_scuola', {header: 'Città scuola', alternativeNames: ['city_name']}),
            new Field('Nome_referente', {header: 'Nome referente', alternativeNames: ['contact_name']}),
            new Field('Cognome_referente', {header: 'Cognome referente', alternativeNames: ['contact_surname']}),
            new Field('Email_referente', {header: 'Email referente', alternativeNames: ['contact_email']}),
            new Field('Codice_distretto', {header: 'Codice distretto', alternativeNames: ['venue.id']}),
            new Field('Nome_distretto', {header: 'Nome distretto', alternativeNames: ['venue.name']}),
            new Field('Email_coordinatori', {header: 'Email coordinatori', alternativeNames: ['coordinatori']}),
        ])
    }

    row_to_sheet_data(row: Row) {
        const email = row.data?.Email_referente || ''
        return {
            schema: "archimede",
            name: row.data?.Codice_meccanografico || '',
            permissions: email ? [{ email, role: 'admin' as const }] : [],
            commonData: {
                Nome_scuola: row.data?.Nome_scuola || '',                
            }
        }
    }
}
