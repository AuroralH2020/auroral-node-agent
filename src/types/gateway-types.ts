// Gateway response types

import { JsonType } from './misc-types'

/**
 * Generic gateway response
 */
export interface GatewayResponse<T = JsonType> {
    error: boolean
    statusCode: number
    statusCodeReason: string
    contentType: string
    message: T[]
}

// Specific gateway responses

export type GtwDeleteResponse = GatewayResponse<{
    oid: string, 
    statusCode: number,
    error?: string
}>

export type GtwRegistrationResponse = GatewayResponse<{
    oid: string
    password: string | null
    name: string
    error?: string
}>

export type GtwUpdateResponse = GatewayResponse<{
    oid: string
    error?: boolean
}>

export type GtwGetRegistrationsResponse = GatewayResponse<string>

// Other related types

export interface RegistrationResultPost {
        oid: string
        password: string | null
        name: string
        error?: string
}

export interface RemovalBody {
    agid: string,
    oids: string[]
}

export interface IdDiscoveryType {
    objects: { oid: string }[]
}

export interface ContractItemType {
    'oid': string,
    'cid': string,
    'agid': string,
    'name': string,
    'dataAccess': boolean,
    'company':string
}

export interface NodeType {
    agid: string,
    cid: string,
    company: string
}

export interface BasicResponse<T = JsonType> {
    error: string | null
    message: T
}
