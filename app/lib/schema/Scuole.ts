import { Field } from './fields'
import Schema from './Schema'
import { Row } from '../models'

export default class Scuole extends Schema {
    constructor() {
        super('scuole', 'scuole e referenti', [
            new Field('ID_scuola', 'ID scuola', ['school_id']),
            new Field('Codice_meccanografico', 'Codice meccanografico', ['school_external_id']),
            new Field('Tipo_scuola', 'Tipo scuola', ['school_type']),
            new Field('Nome_scuola', 'Nome scuola', ['school_name']),
            new Field('Indirizzo_scuola', 'Indirizzo scuola', ['address']),
            new Field('CAP_scuola', 'CAP scuola', ['postal_code']),
            new Field('Città_scuola', 'Città scuola', ['city_name']),
            new Field('Provincia_scuola', 'Provincia scuola', ['province_name']),
            new Field('Sigla_provincia_scuola', 'Sigla provincia scuola', ['province_id']),
            new Field('Regione_scuola', 'Regione scuola', ['region_name']),
            new Field('Email_scuola', 'Email scuola', ['school_email']),
            new Field('Nome_referente', 'Nome referente', ['contact_name']),
            new Field('Cognome_referente', 'Cognome referente', ['contact_surname']),
            new Field('Email_referente', 'Email referente', ['contact_email']),
            new Field('Cellulare_referente', 'Cellulare referente', ['contact_phone']),
            new Field('ID_distretto', 'ID distretto', ['zone_id']),
            new Field('Nome_distretto', 'Nome distretto', ['zone_name']),
            new Field('Email_responsabile_distretto', 'Email responsabile distretto', ['zone_admin_email']),
            new Field('Data_ultima_modifica', 'Data ultima modifica', ['last_modified']),
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
