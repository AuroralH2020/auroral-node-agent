// Controller common imports
import { expressTypes } from '../../../types/index'
import { HttpStatusCode } from '../../../utils/http-status-codes'
import { logger, errorHandler } from '../../../utils'
import { responseBuilder } from '../../../utils/response-builder'

// Other imports
import { ContractItemType, JsonType } from '../../../types/misc-types'
import { Registration } from '../../../persistance/models/registrations'
import { gateway } from '../../../microservices/gateway'
import { wot } from '../../../microservices/wot'
import { Config } from '../../../config'
import { Thing } from '../../../types/wot-types'
import { NodeType } from '../../../types/gateway-types'
import { queries } from '../../../core/semantics'
import { _ } from '../../../utils/is-type'
import { addTDtoCache, getTDfromCache } from '../../../persistance/persistance'

type discoveryCtrl = expressTypes.Controller<{ id?: string }, {}, {}, string[], {}>

/**
 * Discovery endpoint LOCAL
 * Check what remote objects can you see
 * Returns array of OIDs
 */
 export const discoveryLocal: discoveryCtrl = async (req, res) => {
    const { id } = req.params
      try {
      const data = await gateway.discovery(id)
      const result = data.objects.map(it => it.oid)
      // TBD: Filter out system objects
      return responseBuilder(HttpStatusCode.OK, res, null, result)
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
  }

type orgNodesCtrl = expressTypes.Controller<{ cid?: string }, {}, {}, NodeType[], {}>

/**
 * Discovery endpoint LOCAL
 * Check what nodes can you see in a certain organisation
 */
export const getOrganisationNodes: orgNodesCtrl = async (req, res) => {
    const { cid } = req.params
    try {
        const data = (await gateway.organisationNodes(cid)).message
        return responseBuilder(HttpStatusCode.OK, res, null, data)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type communityNodesCtrl = expressTypes.Controller<{ commid: string }, {}, {}, NodeType[], {}>

/**
 * Discovery endpoint LOCAL
 * Check what nodes can you see in a community
 */
    export const getCommunityNodes: communityNodesCtrl = async (req, res) => {
    const { commid } = req.params
        try {
            const data = (await gateway.communityNodes(commid)).message
            return responseBuilder(HttpStatusCode.OK, res, null, data)
        } catch (err) {
            const error = errorHandler(err)
            logger.error(error.message)
            return responseBuilder(error.status, res, error.message)
        }
    }

type organisationItemsCtrl = expressTypes.Controller<{}, {}, {}, string[], {}>

/**
 * Discovery endpoint LOCAL
 * Check what remote items can you see in an organisation
 */
    export const getOrganisationItems: organisationItemsCtrl = async (_req, res) => {
        try {
            const data = (await gateway.organisationItems()).message
            return responseBuilder(HttpStatusCode.OK, res, null, data)
        } catch (err) {
            const error = errorHandler(err)
            logger.error(error.message)
            return responseBuilder(error.status, res, error.message)
        }
    }

type getContractItemsCtrl = expressTypes.Controller<{ ctid: string, oid?: string }, {}, {}, ContractItemType[], {}>

/**
 * Discovery endpoint LOCAL
 * Check what items can you see in a contract
 */
    export const getContractItems: getContractItemsCtrl = async (req, res) => {
    const { ctid, oid } = req.params
        try {
            if (oid) {
                return responseBuilder(HttpStatusCode.OK, res, null, (await gateway.contractItemsByOwner(ctid, oid)).message)
            } else {
                return responseBuilder(HttpStatusCode.OK, res, null, (await gateway.contractItems(ctid)).message)
            }
        } catch (err) {
            const error = errorHandler(err)
            logger.error(error.message)
            return responseBuilder(error.status, res, error.message)
        }
    }

/**
 * Semantic discovery
 */

type discoveryLocalTdCtrl = expressTypes.Controller<{ oid: string }, {}, {}, Thing | string, {}>
 
export const discoverLocalTd: discoveryLocalTdCtrl = async (req, res) => {
    const { oid } = req.params
    try {
        let result
        if (Config.WOT.ENABLED) {
                result = (await wot.retrieveTD(oid)).message
        } else {
                result = 'You need to enable WoT to use this function'
        }
        return responseBuilder(HttpStatusCode.OK, res, null, result)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type discoveryLocalSemanticCtrl = expressTypes.Controller<{ query?: string}, string, {}, JsonType | string, {}>
 
export const discoverLocalSemantic: discoveryLocalSemanticCtrl = async (req, res) => {
    const sparql = req.params.query ? queries.getByName(req.params.query) : req.body
    try {
        let result
        if (!sparql) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing sparql query')
        } else if (Config.WOT.ENABLED) {
            result = (await wot.searchSPARQL(sparql)).message
        } else {
            result = 'You need to enable WoT to use this function'
        }
        return responseBuilder(HttpStatusCode.OK, res, null, result)
    } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
    }
}

type discoveryRemoteCtrl = expressTypes.Controller<{ agid: string }, string | undefined, { query?: string }, Registration[] | Thing[], {}>

/**
 * Used by WOT federative calls
 * returning without wrapper
 * @param req 
 * @param res 
 * @returns 
 */
 export const discoveryRemote: discoveryRemoteCtrl = async (req, res) => {
    const { agid } = req.params
    const sparql = req.query.query
    try {
        const params = { sparql }
        const data = await gateway.discoveryRemote(agid, params)
        if (data.error) {
            const response: string = data.statusCodeReason
            logger.warn('Discovery failed')
            return responseBuilder(data.statusCode, res, response)
          } else {
            try {
                const response = data.message[0].message.wrapper.message
                // Return without wrapping and as JSON or TEXT
                if (_.isJSON(response)) {
                    return res.status(200).json(response)
                } else {
                    return res.status(200).send(response)
                }
            } catch (err) {
                const error = errorHandler(err)
                logger.error(error.message)
                return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Destination Node could not parse the Sparql query, please revise syntax')
            }
          } 
      } catch (err) {
        logger.warn('AGID:' + agid + ' not reachable')
        // return empty triplet
        const empty = {
            'head': {
              'vars': [
                'sub',
                'pred',
                'obj',
              ]
            },
            'results': {
              'bindings': []
            }
          }
        return res.status(200).json(empty)
      }
}

type discoveryTdRemoteCtrl = expressTypes.Controller<{ agid: string }, string | undefined, { oids?: string }, { oid: string, success: boolean, td: Thing }[], {}>

 export const discoveryTdRemote: discoveryTdRemoteCtrl = async (req, res) => {
    const { agid } = req.params
    const oids = req.query.oids
    try {
        if (!oids) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing oids')
        }
        // First check TD in local cache
        try {
            const response = await Promise.all(oids.split(',').map(async oid => {
                const td = await getTDfromCache(oid) as Thing
                if (!td) {
                    throw new Error('TD not found')
                }
                return { oid, success: true, td }
            }))
            logger.debug('TDs found in local cache')
            // all tds found in local cache -> return
            return responseBuilder(HttpStatusCode.OK, res, null, response)
        } catch (error) {
            logger.debug('TDs not found in local cache - requesting from remote node')
        }
       
        const data = await gateway.discoveryRemote(agid, { sparql: undefined, oids })
        if (data.error) {
            const response: string = data.statusCodeReason
            logger.warn('Discovery failed')
            return responseBuilder(data.statusCode, res, response)
          } else {
            try {
                const response = data.message[0].message.wrapper
                // Store in cache
                await Promise.all(response.map(async (item: { oid: string, success: boolean, td: Thing }) => {
                    if (item.success) {
                        await addTDtoCache(item.oid, JSON.stringify(item.td), true)
                    }
                }))
                //
                return responseBuilder(HttpStatusCode.OK, res, null, response)
            } catch (err) {
                const error = errorHandler(err)
                logger.error(error.message)
                return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Destination Node could not parse the Sparql query, please revise syntax')
            }
          } 
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
}

type federativeDiscoveryRemoteCtrl = expressTypes.Controller<{ query?: string }, string | undefined, { agids: string }, JsonType, {}>

export const discoveryFederative: federativeDiscoveryRemoteCtrl = async (req, res) =>  {   
    const sparql = req.params.query ? queries.getByName(req.params.query) : req.body
    const agids = req.query.agids
    try {
        if (!agids) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing agids')
        }
        if (!sparql) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing sparql query')
        }
        // build URL to ask remote WOT
        const urls = agids.split(',').map((agid) => 'http://auroral-agent:4000/api/discovery/remote/semantic/' + agid)
        const data = await wot.searchFederativeSPARQL(sparql, urls)
        return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
}

type federativeCommunityDiscoveryCtrl = expressTypes.Controller<{ commid: string }, string, {}, JsonType, {}>

export const discoveryCommunityFederative: federativeCommunityDiscoveryCtrl = async (req, res) => {
    const sparql = req.body
    const { commid } = req.params
    try {
        if (!commid) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing agids')
        }
        if (!sparql) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing sparql query')
        }
        // build URL to ask remote WOT
        const communityInfo = (await gateway.communityNodes(commid)).message
        if (communityInfo.length === 0) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'There are no nodes in this community')
        }
        const agids = communityInfo.map((node) => node.agid)
        const urls = agids.map((agid) => 'http://auroral-agent:4000/api/discovery/remote/semantic/' + agid)
        const data = await wot.searchFederativeSPARQL(sparql, urls)
        return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
}

type federativeOrganisationDiscoveryCtrl = expressTypes.Controller<{}, string, {}, JsonType, {}>

export const discoveryOrganisationFederative: federativeOrganisationDiscoveryCtrl = async (req, res) => {
    const sparql = req.body
    try {
        if (!sparql) {
            return responseBuilder(HttpStatusCode.BAD_REQUEST, res, 'Missing sparql query')
        }
        // get my org agids
        const agids = (await gateway.organisationNodes()).message.map((node) => node.agid)
        // create agent URLS
        const urls = agids.map((agid) => 'http://auroral-agent:4000/api/discovery/remote/semantic/' + agid)
        // get sparql results
        const data = await wot.searchFederativeSPARQL(sparql, urls)
        return responseBuilder(HttpStatusCode.OK, res, null, data)
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
}

type getRemoteAgidCtrl = expressTypes.Controller<{ oid: string }, { }, { }, string, {}>

export const getRemoteAgid: getRemoteAgidCtrl = async (req, res) => {
    const { oid } = req.params
    try {
        const agid = (await gateway.getAgentByOid(oid)).message
        return responseBuilder(HttpStatusCode.OK, res, null, agid)
      } catch (err) {
        const error = errorHandler(err)
        logger.error(error.message)
        return responseBuilder(error.status, res, error.message)
      }
}

