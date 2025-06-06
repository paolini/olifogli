import Schema from './schema/Schema'
import Archimede from './schema/Archimede'
import Distrettuale from './schema/Distrettuale'
import AmmissioneSenior from './schema/AmmissioneSenior'

const schemaClasses: Array<new () => Schema> = [
    Archimede,
    Distrettuale,
    AmmissioneSenior
]

export const schemas = Object.fromEntries(
    schemaClasses.map(SchemaClass => {
        const instance = new SchemaClass()
        return [instance.name, instance]
    })
)
