// Controller common imports
import { expressTypes } from '../../../types/index'
import { HttpStatusCode } from '../../../utils/http-status-codes'
import { logger, errorHandler } from '../../../utils'
import { responseBuilder } from '../../../utils/response-builder'

// Other imports
import * as persistance from '../../../persistance/persistance'
import { gateway } from '../../../microservices/gateway'
import { Configuration } from '../../../persistance/models/configurations'

// Types and enums
enum registrationAndInteractions {
    REGISTRATIONS = 'registrations',
    PROPERTIES = 'properties',
    ACTIONS = 'actions',
    EVENTS = 'events'
}

// Controllers

type configurationCtrl = expressTypes.Controller<{}, {}, {}, Configuration, {}>
 
export const getConfiguration: configurationCtrl = async (req, res) => {
    try {
        const config = await persistance.getConfigInfo()
        logger.info('Requested configuration file')
        return responseBuilder(HttpStatusCode.OK, res, null, config)
	} catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
	}
}

type importsCtrl = expressTypes.Controller<{}, {}, {}, null, {}>
 
export const importFiles: importsCtrl = async (req, res) => {
    try {
                // await persistance.loadConfigurationFile(registrationAndInteractions.PROPERTIES)
                // await persistance.loadConfigurationFile(registrationAndInteractions.EVENTS)
                // await persistance.loadConfigurationFile(registrationAndInteractions.ACTIONS)
                await persistance.loadConfigurationFile(registrationAndInteractions.REGISTRATIONS)
                return responseBuilder(HttpStatusCode.OK, res, null, null)
	} catch (err) {
                const error = errorHandler(err)
                logger.error(error.message)
                return responseBuilder(error.status, res, error.message)
	}
}

type exportsCtrl = expressTypes.Controller<{}, {}, {}, null, {}>
 
export const exportFiles: exportsCtrl = async (req, res) => {
    try {
        // await persistance.saveConfigurationFile(registrationAndInteractions.PROPERTIES)
        // await persistance.saveConfigurationFile(registrationAndInteractions.EVENTS)
        // await persistance.saveConfigurationFile(registrationAndInteractions.ACTIONS)
        await persistance.saveConfigurationFile(registrationAndInteractions.REGISTRATIONS)
        return responseBuilder(HttpStatusCode.OK, res, null, null)
	} catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
	}
}

type healthCheckCtrl = expressTypes.Controller<{}, {}, {}, { Redis: string, Gateway: string, NodeApp: string }, {}>
 
export const healthCheck: healthCheckCtrl = async (req, res) => {
    try {
        const redisHealth = await persistance.redisHealth()
        const gtwHealth = !(await gateway.health()).error ? 'OK' : 'DOWN'
        const response = { 'Redis': redisHealth, 'Gateway': gtwHealth, 'NodeApp': 'OK' }
        return responseBuilder(HttpStatusCode.OK, res, null, response)
	} catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
	}
}

