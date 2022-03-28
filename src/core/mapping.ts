/* eslint-disable no-multi-str */
import Mustache from 'mustache'
import { logger, errorHandler, MyError } from '../utils'
import { wot } from '../microservices/wot'
import { InteractionMapping, JsonType, ThingMapping } from '../types/misc-types'
import { Thing } from '../types/wot-types'
import { redisDb } from '../persistance/redis'
import { getItem } from '../persistance/persistance'
import { RegistrationNonSemantic } from '../persistance/models/registrations'

const thingMappingBase = 
'{"@context": "Sensor",\
"@type": "{{{@type}}}",\
"oid": "{{{id}}}",\
"iid": "{{{iid}}}",\
"measurements": {{{measurements}}} }' 

const propertyMappingBase = 
'{"@type": "{{{@type}}}",\
"value": "{{{value}}}",\
"dataType": "{{{dataType}}}",\
"units": "{{{units}}}",\
"timestamp": "{{{timestamp}}}"}' 

export const storeMapping = async (oid: string) => {
    logger.debug('Storing mapping to redis: ' + oid)
    const td = (await wot.retrieveTD(oid)).message
    if (!td) {
        throw new MyError('TD not found')
    }
    const mappings = generateMapping(td)
    await Promise.all(mappings.map(async map => {
        await redisDb.hset(map.oid, map.iid, map.mapping)
    })
)
}

export const useMapping = async (oid: string, iid: string, value: string) : Promise<JsonType> => {
    // retrieve mapping 
    try {
        const mapping = await redisDb.hget(oid, iid) 
        if (!mapping) {
            throw new MyError('Mapping not found')
        }
        // enrich using mustache
        const mappingObject = JSON.parse(Mustache.render(mapping, { value, timestamp: new Date().toISOString() }))
        return mappingObject as JsonType
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        throw new Error('Corrupted mapping:' + error.message)
    }
}

export const removeMapping = async (oid: string) => {
   // remove from Redis
   const item = await getItem('registrations', oid) as RegistrationNonSemantic
   // if properties are defined 
   if (item && item.properties) {
        await Promise.all(
            item.properties.map(async prop => {
                logger.info('Removing mapping for ' + oid + ' ' + prop)
                // remove from redis
                await redisDb.hdel(oid, prop)
            })
        )
   }
}

const generateMapping = (td: Thing): InteractionMapping[] => {
    const propMappings = Object.entries(td.properties).map(prop => {
        // TBD: Type == array?
        if (!prop[1]['@type']) {
            prop[1]['@type'] = ['undefined']
        }
        prop[1]['@type'] = Array.isArray(prop[1]['@type']) ? prop[1]['@type'] : [prop[1]['@type']]

        if (!prop[1].dataType) {
            prop[1].dataType = 'undefined'
        }
        if (!prop[1].units) {
            prop[1].units = 'undefined'
        }
        const measurements = '[' + Object.entries(prop[1]['@type']).map(type => {
            return Mustache.render(propertyMappingBase, { ...prop, '@type': type[1].toString(),value: '{{{value}}}', timestamp: '{{{timestamp}}}' })
        }) + ']'
        return { oid: td.id, iid: prop[1].id, mapping: Mustache.render(thingMappingBase, { ...td,  measurements: measurements, iid: prop[1].id }) } as InteractionMapping
    })
    return propMappings
}
