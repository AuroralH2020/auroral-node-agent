/**
 * Gateway services
 * Implements support functionality
 */
 import { logger, errorHandler, MyError, HttpStatusCode } from '../utils'
 import { gateway } from '../microservices/gateway'
 import { addItem,  getItem, updateItem } from '../persistance/persistance'
 import { RegistrationResultPost } from '../types/gateway-types'
 import { RegistrationBody, RegistrationnUpdateNm, RegistrationnUpdateRedis, UpdateBody } from '../persistance/models/registrations'
 import { Config } from '../config'
import { UpdateResult } from '../types/misc-types'
import { wot } from '../microservices/wot'
 
// CONSTANTS

const RETRY = 10 // Defines number of login attempts on error

// Types

type RegistrationRet = {
    registrations: RegistrationResultPost[],
    errors: RegistrationResultPost[]
}

type UpdateRet = {
    updates: UpdateResult[],
    errors: UpdateResult[]
}

 export const gtwServices = {
     doLogins: async (array: string[] | null): Promise<void> => {
         try {
            const items: string[] = array ? array : await getItem('registrations') as string[]
            await _login_gateway(RETRY)
            const errors = await _login_all(items)
            // Retry items that failed to login
            if (errors.length > 0) {
                logger.warn('Some items failed to log in, retrying...')
                setTimeout(_login_item, 2000, errors)
            }
         } catch (err) {
             const error = errorHandler(err)
             logger.error(error.message)
         }
     },
     doLogouts: async (array: string[] | null, stopgtw: boolean = true): Promise<void> => {
        const items: string[] = array ? array : await getItem('registrations') as string[]
        items.forEach(async (it) => {
            try {
                await gateway.logout(it)
            } catch (err) {
                const error = errorHandler(err)
                logger.error('Item ' + it + ' could not be logged out')
                logger.error(error.message)
            }
        })
        if (stopgtw) {
            logger.info('Logging out Node instance...')
            await gateway.logout() // Stop always the gateway last
        }
     },
     /**
      * Register object in platform
      * Only 1 by 1 - No multiple registration accepted
      */
     registerObject: async (items: RegistrationBody[]): Promise<RegistrationRet> => {
            const itemsForCloud = _buildItemsForCloud(items)
            // Register in cloud
            const result = await gateway.postRegistrations({
                agid: Config.GATEWAY.ID,
                items: itemsForCloud
            })
            // Cloud returns global error
            if (result.error) {
                await _revert_wot_registration(itemsForCloud)
                throw new MyError('Communication with platform failed: ' + JSON.stringify(result.message[0].error), HttpStatusCode.SERVICE_UNAVAILABLE)
            }
            // Register items locally
            const registrations: RegistrationResultPost[] = []
            const errors: RegistrationResultPost[] = []
            for (let i = 0, l = result.message.length; i < l; i++) {
                const it = result.message[i]
                if (!it.error && it.password) {
                try {
                    const td = items.filter(x => x.oid === it.oid)
                    await addItem('registrations', 
                        { 
                            ...td[0], 
                            oid: it.oid,
                            password: it.password,
                            created: new Date().toISOString(),
                            credentials: 'Basic ' + Buffer.from(it.oid + ':' + it.password, 'utf-8').toString('base64')
                        })
                    logger.info(it.name + ' with oid ' + it.oid + ' successfully registered!')
                    registrations.push(it)
                } catch (err) {
                    const error = errorHandler(err)
                    logger.warn(it.name + ' with oid ' + it.oid + ' had a registration issue...')
                    logger.error(error.message)
                    errors.push({ oid: it.oid, name: it.name, password: null, error: 'Error storing in REDIS' })
                    // If REDIS registration fails remove it from cloud
                    await _revertCloudRegistration(it.oid)
                }
            } else {
                logger.warn(it.name + ' with oid ' + it.oid + ' could not be registered...')
                errors.push({ oid: it.oid, name: it.name, password: null, error: 'Error registering in CLOUD' })
            }
        }
        // Do login of infrastructure with small delay to avoid race conditions
        setTimeout(
            async () => {
                // Get new objects OIDs
                // const oids = await getItem('registrations') as string[]
                const oids = registrations.map(it => it.oid)
                gtwServices.doLogins(oids)
            }, 
            5000)
        // Return and end registration
        return { registrations, errors }
     },
     updateObject: async (items: UpdateBody[]): Promise<UpdateRet> => {
        // Prepare items for update
        const nmItems = _filterNmProperties(items)
        // Send update to cloud
        const result = await gateway.updateRegistration({
            agid: Config.GATEWAY.ID,
            items: nmItems
        })
        // Cloud returns global error
        if (result.error) {
            throw new MyError('Communication with platform failed: ' + JSON.stringify(result.message[0].error), HttpStatusCode.SERVICE_UNAVAILABLE)
        }
        // Update items locally
        const updates: UpdateResult[] = []
        const errors: UpdateResult[] = []
        for (let i = 0, l = result.message.length; i < l; i++) {
            const it = result.message[i]
            if (!it.error) {
                try {
                    const itemUpdate = items.filter(x => x.oid === it.oid)[0]
                    const redistItem = _filterRedisProperties(itemUpdate) 
                    // Update redis DB
                    await updateItem(redistItem)
                    logger.info(it.oid + ' successfully updated!')
                    updates.push({ oid: it.oid, success: true })
                } catch (err) {
                    const error = errorHandler(err)
                    logger.warn(it.oid + ' had a updating issue...')
                    logger.error(error.message)
                    errors.push({ oid: it.oid, error: 'Error updating in REDIS' })
                }
            } else {
                logger.warn(it.oid + ' could not be updated...')
                errors.push({ oid: it.oid, error: 'Error updating in CLOUD' })
            }
        }
        // Do login of infrastructure with small delay to avoid race conditions
        setTimeout(
            async () => {
                // Get new objects OIDs stored locally
                // const oids = await getItem('registrations') as string[]
                const oids = updates.map(it => it.oid)
                gtwServices.doLogins(oids)
            }, 
            5000)
        // Return and end registration
        return { updates, errors }
    },
     /**
      * Compare Local infrastracture with platform
      * Both should have the same objects registered
      */
     compareLocalAndRemote: (local: string[], platform: string[]) => {
         try {
            let mismatch = false // Flag to store unsynchronized status
            const notInCloud: string[] = []
            const notInLocal: string[] = []
             for (let i = 0, l = local.length; i < l; i++) {
                 if (platform.indexOf(local[i]) === -1) {
                     notInCloud.push(local[i])
                     mismatch = true
                 }
             }
             for (let i = 0, l = platform.length; i < l; i++) {
                if (local.indexOf(platform[i]) === -1) {
                    notInLocal.push(platform[i])
                    mismatch = true
                }
            }
            if (mismatch) {
            logger.warn('--- Please resynchronize cloud and local infrastructure, following the instructions below: ')
            if (notInCloud.length > 0) {
                logger.warn('Objects not registered in Cloud, please remove and register again using the AURORAL Open API: ' + notInCloud.join(','))
            }
            if (notInLocal.length > 0) {
                logger.warn('Objects not registered locally, please register again using the AURORAL Open API and ask admin to remove broken OIDs from cloud: ' + notInLocal.join(','))
            }
            } else {
            logger.info('--- Local and platform objects match!')
            }
            return true
         } catch (err) {
             const error = errorHandler(err)
             logger.warn(error.message)
             return false
        }
    }
}
    
//  Private functions
    const _login_gateway = async (retry: number = RETRY) => {
            try {
                if (retry === 0) {
                    logger.error('After ' + RETRY + ' attempts the gateway could not be logged in, please try manually or restart the Node')
                    return
                }
                await gateway.login()
                logger.info('Gateway successfully logged in!')
                return
            } catch (err) {
                const error = errorHandler(err)
                logger.error(error.message)
                logger.warn('Retrying gateway with attempt: ' + String(RETRY - retry + 1))
                await _login_gateway(retry - 1)
            }
    }

    const _login_all = async (array: string[]) => {
        const todos: Array<Promise<any>> = []
        array.forEach(element => {
            todos.push(gateway.login(element)
            .then(() => {
                return true
            })
            .catch(() => {
                return false 
            }))
        })
        const results = await Promise.all(todos)
        const errors: string[] = array.filter(item => !results[array.indexOf(item)])
        return errors
    }

    const _login_item = async (array: string[], retry: number = RETRY) => {
        try {
            if (array.length === 0) {
                logger.debug('Logging items finished')
                return
            }
            if (retry === 0) {
                logger.error('After ' + RETRY + ' attempts item ' + array[0] + ' could not be logged in, please try manually or restart the Node')
                array.shift()
                await _login_item(array, RETRY)
                return
            }
            await gateway.login(array[0])
            logger.info('Item ' + array[0] + ' successfully logged in!')
            array.shift()
            await _login_item(array, RETRY)
            return
        } catch (err) {
            const error = errorHandler(err)
            logger.error(error.message)
            logger.warn('Retrying ' + array[0] + ' with attempt: ' + String(RETRY - retry + 1))
            await _login_item(array, retry - 1)
        }
    }

    const _filterRedisProperties = (item: UpdateBody): RegistrationnUpdateRedis => {
        if (!item.oid) {
            throw new Error('Item does not have oid')
        }
        const itemRedis: RegistrationnUpdateRedis = {
            oid: item.oid,
            name: item.name,
            adapterId: item.adapterId,
            properties: item.properties ? item.properties.toString() : undefined,
            actions: item.actions ? item.actions.toString() : undefined,
            events: item.events ? item.events.toString() : undefined
        }
        return itemRedis
    }

    const _filterNmProperties = (items: UpdateBody[]): RegistrationnUpdateNm[] => {
        const nmItems: RegistrationnUpdateNm[] = []
        items.forEach(item => {
            if (!item.oid) {
                throw new Error('Item does not have oid')
            }
            const itemNm: RegistrationnUpdateNm = {
                oid: item.oid,
                name: item.name,
                adapterId: item.adapterId,
                labels: item.labels,
                avatar: item.avatar,
                groups: item.groups !== undefined ? [...item.groups] : undefined,
                description: item.description,
            }
            nmItems.push(itemNm)
        })
        return nmItems
    }

    const _buildItemsForCloud = (items: RegistrationBody[]) => {
        return items.map(it => {
            const item : RegistrationBody = {
               name: it.name,
               type: it.type,
               adapterId: it.adapterId, 
               oid: it.oid,
               labels: it.labels ? it.labels : undefined,
               groups: it.groups ? it.groups : undefined,
               avatar: it.avatar ? it.avatar : undefined
            }
            return item  
        })
    }

    const _revertCloudRegistration = async (oid: string) => {
        try {
            await gateway.removeRegistrations({ oids: [oid] })
        } catch (err) {
            const error = errorHandler(err)
            logger.error('Attempt to revert cloud registration failed ' + oid)
            logger.error(error.message)
        }
    }

    const _revert_wot_registration = async (items: RegistrationBody[]) => {
        // Unregister from WoT on CLOUD global error
        for (let i = 0, l = items.length; i < l; i++) {
        const it = items[i]
            logger.info('Reverting registration in WoT of OID: ' + it.oid)
            try {
                await wot.deleteTD(it.oid)
            } catch (err) {
                const error = errorHandler(err)
                logger.error('Attempt to revert wot registration failed')
                logger.error(error.message)
            }
        }
    }
