'use strict'

var bsv = require('../../')
var Hash = bsv.crypto.Hash
var Address = bsv.Address
var Transaction = bsv.Transaction
var $ = bsv.util.preconditions

/**
 * Legal Token Protocol - Registry Primitives
 * 
 * Provides primitives for token registry management, revocation processing,
 * and discovery mechanisms without direct blockchain publishing.
 * External systems handle actual registry storage and blockchain anchoring.
 */

var LTPRegistry = {
  
  /**
   * Prepare registry data structure for external storage
   * @param {Object} config - Registry configuration
   * @returns {Object} Prepared registry data
   */
  prepareRegistry: function(config) {
    config = config || {}
    
    $.checkArgument(typeof config === 'object', 'Config must be object')
    
    var registry = {
      id: config.id || this._generateRegistryId(),
      name: config.name || 'Legal Token Registry',
      jurisdiction: config.jurisdiction || 'GLOBAL',
      authority: config.authority || null,
      created: new Date().toISOString(),
      version: '1.0.0',
      
      // Registry configuration
      config: {
        allowPublicRegistration: config.allowPublicRegistration || false,
        requireApproval: config.requireApproval || true,
        enableRevocation: config.enableRevocation !== false,
        enableAuditTrail: config.enableAuditTrail !== false,
        retentionPeriod: config.retentionPeriod || '7Y', // 7 years
        complianceLevel: config.complianceLevel || 'STANDARD'
      },
      
      // Data structure templates
      dataStructure: {
        tokens: 'Map<tokenId, registrationRecord>',
        revocations: 'Map<tokenId, revocationRecord>',
        auditLog: 'Array<auditEntry>',
        statistics: {
          totalTokens: 0,
          activeTokens: 0,
          revokedTokens: 0,
          registrations: 0
        }
      },
      
      // External integration points
      externalStorage: {
        required: true,
        type: 'database_or_blockchain',
        endpoints: {
          store: 'POST /registry/{id}/tokens',
          retrieve: 'GET /registry/{id}/tokens/{tokenId}',
          search: 'GET /registry/{id}/search',
          revoke: 'POST /registry/{id}/revocations'
        }
      }
    }
    
    // Add initial audit entry template
    var initialAudit = this._prepareAuditEntry({
      action: 'REGISTRY_CREATED',
      actor: config.authority,
      timestamp: registry.created,
      metadata: {
        jurisdiction: registry.jurisdiction,
        config: registry.config
      }
    })
    
    return {
      success: true,
      registry: registry,
      initialAudit: initialAudit,
      instructions: {
        step1: 'Store registry configuration in external system',
        step2: 'Initialize token storage with provided data structure',
        step3: 'Set up audit logging with provided templates',
        step4: 'Configure external endpoints for registry operations'
      }
    }
  },
  
  /**
   * Prepare token registration data for external registry
   * @param {Object} token - Token to register
   * @param {Object} registryConfig - Registry configuration
   * @param {Object} options - Registration options
   * @returns {Object} Prepared registration data
   */
  prepareTokenRegistration: function(token, registryConfig, options) {
    options = options || {}
    
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
    
    try {
      // Validate token
      var validation = this._validateTokenForRegistration(token, registryConfig)
      if (!validation.valid) {
        return {
          success: false,
          error: 'Token validation failed: ' + validation.error
        }
      }
      
      // Create registration record template
      var registrationRecord = {
        tokenId: token.id,
        tokenHash: this._hashToken(token),
        token: token,
        status: registryConfig.requireApproval ? 'PENDING' : 'ACTIVE',
        registeredBy: options.registeredBy || 'UNKNOWN',
        registeredAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        metadata: options.metadata || {},
        compliance: {
          jurisdiction: token.jurisdiction || registryConfig.jurisdiction,
          level: this._calculateComplianceLevel(token),
          checks: validation.checks || []
        }
      }
      
      // Prepare audit entry
      var auditEntry = this._prepareAuditEntry({
        action: 'TOKEN_REGISTERED',
        actor: options.registeredBy,
        tokenId: token.id,
        timestamp: registrationRecord.registeredAt,
        metadata: {
          status: registrationRecord.status,
          tokenType: token.type,
          compliance: registrationRecord.compliance
        }
      })
      
      return {
        success: true,
        registrationRecord: registrationRecord,
        auditEntry: auditEntry,
        registrationId: this._generateRegistrationId(token.id),
        validation: validation,
        externalOperations: {
          store: {
            endpoint: 'POST /registry/' + registryConfig.id + '/tokens',
            data: registrationRecord
          },
          audit: {
            endpoint: 'POST /registry/' + registryConfig.id + '/audit',
            data: auditEntry
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare token approval data for external registry
   * @param {String} tokenId - Token ID to approve
   * @param {String} approver - Approver identity
   * @param {Object} registryConfig - Registry configuration
   * @returns {Object} Prepared approval data
   */
  prepareTokenApproval: function(tokenId, approver, registryConfig) {
    try {
      $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
      $.checkArgument(typeof approver === 'string', 'Approver must be string')
      $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
      
      var approvalData = {
        tokenId: tokenId,
        status: 'ACTIVE',
        approvedBy: approver,
        approvedAt: new Date().toISOString()
      }
      
      // Prepare audit entry
      var auditEntry = this._prepareAuditEntry({
        action: 'TOKEN_APPROVED',
        actor: approver,
        tokenId: tokenId,
        timestamp: approvalData.approvedAt
      })
      
      return {
        success: true,
        approvalData: approvalData,
        auditEntry: auditEntry,
        externalOperations: {
          update: {
            endpoint: 'PUT /registry/' + registryConfig.id + '/tokens/' + tokenId + '/status',
            data: approvalData
          },
          audit: {
            endpoint: 'POST /registry/' + registryConfig.id + '/audit',
            data: auditEntry
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare token revocation data for external registry
   * @param {String} tokenId - Token ID to revoke
   * @param {Object} revocation - Revocation details
   * @param {Object} registryConfig - Registry configuration
   * @returns {Object} Prepared revocation data
   */
  prepareTokenRevocation: function(tokenId, revocation, registryConfig) {
    try {
      $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
      $.checkArgument(revocation && typeof revocation === 'object', 'Invalid revocation')
      $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
      
      if (!registryConfig.enableRevocation) {
        return {
          success: false,
          error: 'Revocation is disabled for this registry'
        }
      }
      
      // Create revocation record
      var revocationRecord = {
        tokenId: tokenId,
        reason: revocation.reason || 'UNSPECIFIED',
        revokedBy: revocation.revokedBy || 'UNKNOWN',
        revokedAt: new Date().toISOString(),
        effectiveDate: revocation.effectiveDate || new Date().toISOString(),
        legalBasis: revocation.legalBasis || null,
        evidence: revocation.evidence || null,
        revocationHash: this._generateRevocationHash(tokenId, revocation)
      }
      
      // Prepare token status update
      var statusUpdate = {
        tokenId: tokenId,
        status: 'REVOKED',
        revokedAt: revocationRecord.revokedAt,
        revocationReason: revocationRecord.reason
      }
      
      // Prepare audit entry
      var auditEntry = this._prepareAuditEntry({
        action: 'TOKEN_REVOKED',
        actor: revocation.revokedBy,
        tokenId: tokenId,
        timestamp: revocationRecord.revokedAt,
        metadata: {
          reason: revocationRecord.reason,
          legalBasis: revocationRecord.legalBasis
        }
      })
      
      return {
        success: true,
        revocationRecord: revocationRecord,
        statusUpdate: statusUpdate,
        auditEntry: auditEntry,
        revocationId: this._generateRevocationId(tokenId),
        externalOperations: {
          storeRevocation: {
            endpoint: 'POST /registry/' + registryConfig.id + '/revocations',
            data: revocationRecord
          },
          updateStatus: {
            endpoint: 'PUT /registry/' + registryConfig.id + '/tokens/' + tokenId + '/status',
            data: statusUpdate
          },
          audit: {
            endpoint: 'POST /registry/' + registryConfig.id + '/audit',
            data: auditEntry
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare token status query for external registry
   * @param {String} tokenId - Token ID to check
   * @param {Object} registryConfig - Registry configuration
   * @returns {Object} Prepared status query
   */
  prepareTokenStatusQuery: function(tokenId, registryConfig) {
    try {
      $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
      $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
      
      return {
        success: true,
        query: {
          tokenId: tokenId,
          registryId: registryConfig.id
        },
        externalOperations: {
          retrieve: {
            endpoint: 'GET /registry/' + registryConfig.id + '/tokens/' + tokenId,
            method: 'GET'
          },
          checkRevocation: {
            endpoint: 'GET /registry/' + registryConfig.id + '/revocations/' + tokenId,
            method: 'GET'
          }
        },
        expectedResponse: {
          found: 'boolean',
          status: 'string (PENDING|ACTIVE|REVOKED)',
          registeredAt: 'ISO datetime',
          registeredBy: 'string',
          approvedAt: 'ISO datetime or null',
          approvedBy: 'string or null',
          revokedAt: 'ISO datetime or null',
          revocationReason: 'string or null',
          compliance: 'object',
          revocation: 'object or null'
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare token search query for external registry
   * @param {Object} criteria - Search criteria
   * @param {Object} registryConfig - Registry configuration
   * @returns {Object} Prepared search query
   */
  prepareTokenSearch: function(criteria, registryConfig) {
    criteria = criteria || {}
    
    try {
      $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
      
      // Build query parameters
      var queryParams = []
      
      if (criteria.status) {
        queryParams.push('status=' + encodeURIComponent(criteria.status))
      }
      
      if (criteria.type) {
        queryParams.push('type=' + encodeURIComponent(criteria.type))
      }
      
      if (criteria.registeredBy) {
        queryParams.push('registeredBy=' + encodeURIComponent(criteria.registeredBy))
      }
      
      if (criteria.jurisdiction) {
        queryParams.push('jurisdiction=' + encodeURIComponent(criteria.jurisdiction))
      }
      
      if (criteria.dateFrom) {
        queryParams.push('dateFrom=' + encodeURIComponent(criteria.dateFrom))
      }
      
      if (criteria.dateTo) {
        queryParams.push('dateTo=' + encodeURIComponent(criteria.dateTo))
      }
      
      if (criteria.includeTokens) {
        queryParams.push('includeTokens=true')
      }
      
      if (criteria.sortBy) {
        queryParams.push('sortBy=' + encodeURIComponent(criteria.sortBy))
      }
      
      if (criteria.sortOrder) {
        queryParams.push('sortOrder=' + encodeURIComponent(criteria.sortOrder))
      }
      
      var offset = criteria.offset || 0
      var limit = criteria.limit || 100
      queryParams.push('offset=' + offset)
      queryParams.push('limit=' + limit)
      
      var queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : ''
      
      return {
        success: true,
        searchCriteria: criteria,
        externalOperations: {
          search: {
            endpoint: 'GET /registry/' + registryConfig.id + '/search' + queryString,
            method: 'GET'
          }
        },
        expectedResponse: {
          success: 'boolean',
          results: 'Array<tokenRecord>',
          totalCount: 'number',
          totalRegistrations: 'number',
          offset: 'number',
          limit: 'number',
          hasMore: 'boolean'
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare registry statistics query for external registry
   * @param {Object} registryConfig - Registry configuration
   * @returns {Object} Prepared statistics query
   */
  prepareStatisticsQuery: function(registryConfig) {
    $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
    
    return {
      success: true,
      query: {
        registryId: registryConfig.id
      },
      externalOperations: {
        getStatistics: {
          endpoint: 'GET /registry/' + registryConfig.id + '/statistics',
          method: 'GET'
        }
      },
      expectedResponse: {
        id: 'string',
        name: 'string',
        jurisdiction: 'string',
        created: 'ISO datetime',
        statistics: {
          totalTokens: 'number',
          activeTokens: 'number',
          revokedTokens: 'number',
          registrations: 'number'
        },
        auditEntries: 'number',
        lastActivity: 'ISO datetime'
      }
    }
  },
  
  /**
   * Prepare audit log query for external registry
   * @param {Object} registryConfig - Registry configuration
   * @param {Object} options - Log options
   * @returns {Object} Prepared audit log query
   */
  prepareAuditLogQuery: function(registryConfig, options) {
    options = options || {}
    
    $.checkArgument(registryConfig && typeof registryConfig === 'object', 'Invalid registry config')
    
    if (!registryConfig.enableAuditTrail) {
      return {
        success: false,
        error: 'Audit trail is disabled'
      }
    }
    
    // Build query parameters
    var queryParams = []
    
    if (options.action) {
      queryParams.push('action=' + encodeURIComponent(options.action))
    }
    
    if (options.actor) {
      queryParams.push('actor=' + encodeURIComponent(options.actor))
    }
    
    if (options.tokenId) {
      queryParams.push('tokenId=' + encodeURIComponent(options.tokenId))
    }
    
    if (options.dateFrom) {
      queryParams.push('dateFrom=' + encodeURIComponent(options.dateFrom))
    }
    
    if (options.dateTo) {
      queryParams.push('dateTo=' + encodeURIComponent(options.dateTo))
    }
    
    var offset = options.offset || 0
    var limit = options.limit || 100
    queryParams.push('offset=' + offset)
    queryParams.push('limit=' + limit)
    
    var queryString = queryParams.length > 0 ? '?' + queryParams.join('&') : ''
    
    return {
      success: true,
      auditOptions: options,
      externalOperations: {
        getAuditLog: {
          endpoint: 'GET /registry/' + registryConfig.id + '/audit' + queryString,
          method: 'GET'
        }
      },
      expectedResponse: {
        success: 'boolean',
        entries: 'Array<auditEntry>',
        totalEntries: 'number',
        offset: 'number',
        limit: 'number',
        hasMore: 'boolean'
      }
    }
  },
  
  /**
   * Generate registry ID
   * @private
   */
  _generateRegistryId: function() {
    var data = 'reg_' + Date.now() + '_' + Math.random()
    return 'reg_' + Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  },
  
  /**
   * Generate registration ID
   * @private
   */
  _generateRegistrationId: function(tokenId) {
    var data = 'reg_' + tokenId + '_' + Date.now()
    return Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  },
  
  /**
   * Generate revocation ID
   * @private
   */
  _generateRevocationId: function(tokenId) {
    var data = 'rev_' + tokenId + '_' + Date.now()
    return Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  },
  
  /**
   * Hash token for integrity
   * @private
   */
  _hashToken: function(token) {
    // Remove dynamic fields
    var staticToken = JSON.parse(JSON.stringify(token))
    delete staticToken.proof
    delete staticToken.tokenHash
    
    return Hash.sha256(Buffer.from(JSON.stringify(staticToken))).toString('hex')
  },
  
  /**
   * Generate revocation hash
   * @private
   */
  _generateRevocationHash: function(tokenId, revocation) {
    var data = tokenId + (revocation.reason || '') + (revocation.revokedBy || '') + Date.now()
    return Hash.sha256(Buffer.from(data)).toString('hex')
  },
  
  /**
   * Validate token for registration
   * @private
   */
  _validateTokenForRegistration: function(token, registry) {
    var checks = []
    var valid = true
    
    // Required fields
    if (!token.id) {
      checks.push({ field: 'id', valid: false, error: 'Missing token ID' })
      valid = false
    } else {
      checks.push({ field: 'id', valid: true })
    }
    
    if (!token.type) {
      checks.push({ field: 'type', valid: false, error: 'Missing token type' })
      valid = false
    } else {
      checks.push({ field: 'type', valid: true })
    }
    
    if (!token.issuanceDate) {
      checks.push({ field: 'issuanceDate', valid: false, error: 'Missing issuance date' })
      valid = false
    } else {
      checks.push({ field: 'issuanceDate', valid: true })
    }
    
    // Proof validation
    if (!token.proof) {
      checks.push({ field: 'proof', valid: false, error: 'Missing cryptographic proof' })
      valid = false
    } else {
      checks.push({ field: 'proof', valid: true })
    }
    
    return {
      valid: valid,
      checks: checks
    }
  },
  
  /**
   * Calculate compliance level
   * @private
   */
  _calculateComplianceLevel: function(token) {
    var level = 'BASIC'
    
    if (token.proof && token.proof.type) {
      level = 'STANDARD'
    }
    
    if (token.jurisdiction && token.legalBasis) {
      level = 'ENHANCED'
    }
    
    if (token.attestations && token.attestations.length > 0) {
      level = 'PREMIUM'
    }
    
    return level
  },
  
  /**
   * Prepare audit entry for external storage
   * @private
   */
  _prepareAuditEntry: function(entry) {
    var auditEntry = {
      id: this._generateAuditId(),
      action: entry.action,
      actor: entry.actor || 'SYSTEM',
      tokenId: entry.tokenId || null,
      timestamp: entry.timestamp || new Date().toISOString(),
      metadata: entry.metadata || {},
      hash: this._generateAuditHash(entry)
    }
    
    return auditEntry
  },
  
  /**
   * Generate audit ID
   * @private
   */
  _generateAuditId: function() {
    var data = 'audit_' + Date.now() + '_' + Math.random()
    return 'audit_' + Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 12)
  },
  
  /**
   * Generate audit hash
   * @private
   */
  _generateAuditHash: function(entry) {
    var data = (entry.action || '') + (entry.actor || '') + (entry.tokenId || '') + (entry.timestamp || '')
    return Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  }
}

module.exports = LTPRegistry