'use strict'

var bsv = require('../../')
var Hash = bsv.crypto.Hash
var $ = bsv.util.preconditions

/**
 * Legal Token Protocol - Claim Preparation Primitives
 * 
 * Provides primitives for legal claim validation, formatting, and preparation
 * without direct blockchain publishing. External systems handle claim storage
 * and blockchain anchoring operations.
 */

/**
 * Predefined Legal Claim Schemas
 */
var ClaimSchemas = {
  
  // Property Rights
  PropertyTitle: {
    title: 'Property Title',
    description: 'Real estate property ownership title',
    type: 'object',
    required: ['propertyId', 'address', 'ownershipType'],
    properties: {
      propertyId: {
        type: 'string',
        description: 'Unique property identifier'
      },
      address: {
        type: 'object',
        required: ['street', 'city', 'state', 'country'],
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          postalCode: { type: 'string' }
        }
      },
      ownershipType: {
        type: 'string',
        enum: ['fee_simple', 'leasehold', 'joint_tenancy', 'tenancy_in_common']
      },
      titleNumber: { type: 'string' },
      registeredDate: { type: 'string', format: 'date-time' },
      legalDescription: { type: 'string' },
      encumbrances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            amount: { type: 'number' },
            description: { type: 'string' }
          }
        }
      }
    }
  },
  
  // Vehicle Title
  VehicleTitle: {
    title: 'Vehicle Title',
    description: 'Motor vehicle ownership title',
    type: 'object',
    required: ['vin', 'make', 'model', 'year'],
    properties: {
      vin: {
        type: 'string',
        pattern: '^[A-HJ-NPR-Z0-9]{17}$',
        description: 'Vehicle Identification Number'
      },
      make: { type: 'string' },
      model: { type: 'string' },
      year: { type: 'integer', minimum: 1900, maximum: 2030 },
      titleNumber: { type: 'string' },
      registeredState: { type: 'string' },
      mileage: { type: 'integer', minimum: 0 },
      color: { type: 'string' },
      fuelType: {
        type: 'string',
        enum: ['gasoline', 'diesel', 'electric', 'hybrid', 'other']
      },
      liens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            lienholderName: { type: 'string' },
            lienAmount: { type: 'number' },
            lienDate: { type: 'string', format: 'date' }
          }
        }
      }
    }
  },
  
  // Financial Instruments
  PromissoryNote: {
    title: 'Promissory Note',
    description: 'Legal promise to pay a specified amount',
    type: 'object',
    required: ['principal', 'interestRate', 'maturityDate', 'borrower', 'lender'],
    properties: {
      principalAmount: {
        type: 'number',
        minimum: 0,
        description: 'Principal amount in base currency units'
      },
      currency: { type: 'string', default: 'USD' },
      interestRate: {
        type: 'number',
        minimum: 0,
        maximum: 100,
        description: 'Annual interest rate percentage'
      },
      maturityDate: {
        type: 'string',
        format: 'date',
        description: 'Date when principal and interest are due'
      },
      payee: {
        type: 'string',
        description: 'DID of the payee (creditor)'
      },
      payor: {
        type: 'string', 
        description: 'DID of the payor (debtor)'
      },
      paymentSchedule: {
        type: 'string',
        enum: ['lump_sum', 'monthly', 'quarterly', 'annually']
      },
      collateral: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            value: { type: 'number' },
            type: { type: 'string' }
          }
        }
      },
      defaultProvisions: { type: 'string' },
      governingLaw: { type: 'string' }
    }
  },
  
  // Intellectual Property
  IntellectualProperty: {
    title: 'Intellectual Property',
    description: 'Intellectual property rights and licensing',
    type: 'object',
    required: ['ipType', 'title', 'registrationNumber'],
    properties: {
      ipType: {
        type: 'string',
        enum: ['patent', 'trademark', 'copyright', 'trade_secret']
      },
      title: { type: 'string' },
      creator: { type: 'string', description: 'Creator DID' },
      registrationNumber: { type: 'string' },
      registrationDate: { type: 'string', format: 'date' },
      expirationDate: { type: 'string', format: 'date' },
      jurisdiction: { type: 'string' },
      description: { type: 'string' },
      claims: {
        type: 'array',
        items: { type: 'string' }
      },
      priorArt: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            reference: { type: 'string' },
            date: { type: 'string', format: 'date' },
            relevance: { type: 'string' }
          }
        }
      }
    }
  },
  
  // Professional License
  ProfessionalLicense: {
    title: 'Professional License',
    description: 'Professional practice license or certification',
    type: 'object',
    required: ['licenseType', 'licenseNumber', 'issuingAuthority', 'expirationDate'],
    properties: {
      licenseType: { type: 'string' },
      licenseNumber: { type: 'string' },
      issuingAuthority: { type: 'string' },
      licensee: { type: 'string', description: 'Licensee DID' },
      issueDate: { type: 'string', format: 'date' },
      expirationDate: { type: 'string', format: 'date' },
      renewalDate: { type: 'string', format: 'date' },
      jurisdiction: { type: 'string' },
      scope: { type: 'string' },
      restrictions: {
        type: 'array',
        items: { type: 'string' }
      },
      continuing_education: {
        type: 'object',
        properties: {
          hours_required: { type: 'integer' },
          deadline: { type: 'string', format: 'date' },
          completed_hours: { type: 'integer' }
        }
      }
    }
  },
  
  // Music License
  MusicLicense: {
    title: 'Music License',
    description: 'Music performance and usage licensing',
    type: 'object',
    required: ['songTitle', 'artist', 'licenseType', 'royaltyRate'],
    properties: {
      workTitle: { type: 'string' },
      composer: { type: 'string', description: 'Composer DID' },
      performer: { type: 'string', description: 'Performer DID' },
      licenseType: {
        type: 'string',
        enum: ['mechanical', 'performance', 'synchronization', 'master_use']
      },
      territory: { type: 'string' },
      duration: { type: 'string' },
      royaltyRate: { type: 'number', minimum: 0, maximum: 100 },
      advancePayment: { type: 'number', minimum: 0 },
      exclusivity: { type: 'boolean' },
      mediaTypes: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['cd', 'vinyl', 'digital', 'streaming', 'broadcast', 'film', 'tv']
        }
      },
      usage_restrictions: { type: 'string' },
      copyrightNotice: { type: 'string' }
    }
  }
}

/**
 * Claim Preparation and Validation Primitives
 */
var ClaimValidator = {
  
  /**
   * Prepare claim validation for external processing
   * @param {Object} claim - Claim to validate
   * @param {String} schemaName - Schema name
   * @returns {Object} Prepared validation data
   */
  prepareClaimValidation: function(claim, schemaName) {
    try {
      $.checkArgument(claim && typeof claim === 'object', 'Invalid claim')
      $.checkArgument(typeof schemaName === 'string', 'Schema name must be string')
      
      var schema = ClaimSchemas[schemaName]
      if (!schema) {
        return {
          success: false,
          error: 'Unknown schema: ' + schemaName
        }
      }
      
      var errors = []
      var warnings = []
      
      this._validateObject(claim, schema, '', errors, warnings)
      
      var validation = {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        schema: schemaName,
        claimHash: this.hash(claim),
        canonical: this.canonicalize(claim)
      }
      
      return {
        success: true,
        validation: validation,
        claim: claim,
        schema: schema,
        externalOperations: {
          store: {
            endpoint: 'POST /claims/validate',
            data: {
              claim: claim,
              validation: validation,
              schema: schemaName
            }
          },
          index: {
            endpoint: 'POST /claims/index',
            data: {
              claimHash: validation.claimHash,
              schemaName: schemaName,
              valid: validation.valid
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Validation preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Prepare claim for external attestation
   * @param {Object} claim - Claim to prepare for attestation
   * @param {String} schemaName - Schema name
   * @param {Object} attestor - Attestor information
   * @returns {Object} Prepared attestation data
   */
  prepareClaimAttestation: function(claim, schemaName, attestor) {
    try {
      $.checkArgument(claim && typeof claim === 'object', 'Invalid claim')
      $.checkArgument(typeof schemaName === 'string', 'Schema name must be string')
      $.checkArgument(attestor && typeof attestor === 'object', 'Invalid attestor')
      
      // Validate claim first
      var validation = this.prepareClaimValidation(claim, schemaName)
      if (!validation.success || !validation.validation.valid) {
        return {
          success: false,
          error: 'Cannot attest invalid claim',
          validation: validation
        }
      }
      
      // Prepare attestation structure
      var attestation = {
        type: 'LTP_CLAIM_ATTESTATION',
        claimHash: validation.validation.claimHash,
        schemaName: schemaName,
        attestor: {
          did: attestor.did || attestor.id,
          name: attestor.name || 'Unknown',
          authority: attestor.authority || null,
          jurisdiction: attestor.jurisdiction || null
        },
        attestedAt: new Date().toISOString(),
        confidence: attestor.confidence || 100,
        evidence: attestor.evidence || null,
        notes: attestor.notes || null
      }
      
      // Create attestation hash
      var attestationHash = Hash.sha256(Buffer.from(this.canonicalize(attestation))).toString('hex')
      attestation.attestationHash = attestationHash
      
      return {
        success: true,
        attestation: attestation,
        claim: claim,
        validation: validation.validation,
        externalOperations: {
          storeAttestation: {
            endpoint: 'POST /claims/' + validation.validation.claimHash + '/attestations',
            data: attestation
          },
          notifyStakeholders: {
            endpoint: 'POST /notifications/claim-attested',
            data: {
              claimHash: validation.validation.claimHash,
              attestorDid: attestation.attestor.did,
              attestationHash: attestationHash
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Attestation preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Prepare claim dispute for external processing
   * @param {String} claimHash - Hash of disputed claim
   * @param {Object} disputant - Disputant information
   * @param {Object} dispute - Dispute details
   * @returns {Object} Prepared dispute data
   */
  prepareClaimDispute: function(claimHash, disputant, dispute) {
    try {
      $.checkArgument(typeof claimHash === 'string', 'Claim hash must be string')
      $.checkArgument(disputant && typeof disputant === 'object', 'Invalid disputant')
      $.checkArgument(dispute && typeof dispute === 'object', 'Invalid dispute')
      
      var disputeRecord = {
        type: 'LTP_CLAIM_DISPUTE',
        claimHash: claimHash,
        disputant: {
          did: disputant.did || disputant.id,
          name: disputant.name || 'Unknown',
          jurisdiction: disputant.jurisdiction || null
        },
        dispute: {
          reason: dispute.reason || 'UNSPECIFIED',
          category: dispute.category || 'ACCURACY',
          description: dispute.description || '',
          evidence: dispute.evidence || null,
          requestedAction: dispute.requestedAction || 'REVIEW'
        },
        disputedAt: new Date().toISOString(),
        status: 'FILED',
        priority: dispute.priority || 'NORMAL'
      }
      
      // Create dispute hash
      var disputeHash = Hash.sha256(Buffer.from(this.canonicalize(disputeRecord))).toString('hex')
      disputeRecord.disputeHash = disputeHash
      
      return {
        success: true,
        dispute: disputeRecord,
        disputeId: this._generateDisputeId(claimHash),
        externalOperations: {
          fileDispute: {
            endpoint: 'POST /claims/' + claimHash + '/disputes',
            data: disputeRecord
          },
          notifyStakeholders: {
            endpoint: 'POST /notifications/claim-disputed',
            data: {
              claimHash: claimHash,
              disputantDid: disputeRecord.disputant.did,
              disputeHash: disputeHash
            }
          },
          escalate: {
            endpoint: 'POST /disputes/escalate',
            data: {
              disputeHash: disputeHash,
              priority: disputeRecord.priority
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Dispute preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Prepare bulk claim validation for external processing
   * @param {Array} claims - Array of claims to validate
   * @param {String} schemaName - Schema name for all claims
   * @returns {Object} Prepared bulk validation data
   */
  prepareBulkClaimValidation: function(claims, schemaName) {
    try {
      $.checkArgument(Array.isArray(claims), 'Claims must be array')
      $.checkArgument(typeof schemaName === 'string', 'Schema name must be string')
      
      var validations = []
      var errors = []
      var totalValid = 0
      
      claims.forEach(function(claim, index) {
        try {
          var validation = this.prepareClaimValidation(claim, schemaName)
          if (validation.success && validation.validation.valid) {
            totalValid++
          }
          validations.push({
            index: index,
            result: validation
          })
        } catch (error) {
          errors.push({
            index: index,
            error: error.message
          })
        }
      }.bind(this))
      
      var batchId = this._generateBatchId()
      var batchHash = Hash.sha256(Buffer.from(JSON.stringify(validations.map(v => v.result.validation.claimHash)))).toString('hex')
      
      return {
        success: true,
        batchId: batchId,
        batchHash: batchHash,
        totalClaims: claims.length,
        validClaims: totalValid,
        invalidClaims: claims.length - totalValid,
        validations: validations,
        errors: errors,
        externalOperations: {
          storeBatch: {
            endpoint: 'POST /claims/batch-validate',
            data: {
              batchId: batchId,
              batchHash: batchHash,
              schemaName: schemaName,
              validations: validations
            }
          },
          generateReport: {
            endpoint: 'POST /reports/bulk-validation',
            data: {
              batchId: batchId,
              summary: {
                total: claims.length,
                valid: totalValid,
                invalid: claims.length - totalValid
              }
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Bulk validation preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Canonicalize claim for hashing
   * @param {Object} claim - Claim to canonicalize
   * @returns {String} Canonical JSON string
   */
  canonicalize: function(claim) {
    $.checkArgument(claim && typeof claim === 'object', 'Invalid claim')
    
    // Sort keys recursively
    var canonical = this._sortObjectKeys(claim)
    
    // Return deterministic JSON
    return JSON.stringify(canonical)
  },
  
  /**
   * Hash claim
   * @param {Object} claim - Claim to hash
   * @returns {String} SHA256 hash
   */
  hash: function(claim) {
    var canonical = this.canonicalize(claim)
    return Hash.sha256(Buffer.from(canonical)).toString('hex')
  },
  
  /**
   * Prepare claim template for external form generation
   * @param {String} schemaName - Schema name
   * @param {Object} options - Template options
   * @returns {Object} Prepared template data
   */
  prepareClaimTemplate: function(schemaName, options) {
    options = options || {}
    
    try {
      var schema = ClaimSchemas[schemaName]
      if (!schema) {
        return {
          success: false,
          error: 'Unknown schema: ' + schemaName
        }
      }
      
      var template = this._createTemplateFromSchema(schema)
      var formStructure = this._generateFormStructure(schema)
      
      return {
        success: true,
        schemaName: schemaName,
        template: template,
        schema: schema,
        formStructure: formStructure,
        validation: {
          required: schema.required || [],
          patterns: this._extractPatterns(schema),
          enums: this._extractEnums(schema)
        },
        externalOperations: {
          generateForm: {
            endpoint: 'POST /forms/generate',
            data: {
              schemaName: schemaName,
              formStructure: formStructure,
              template: template
            }
          },
          saveTemplate: {
            endpoint: 'POST /templates/claim',
            data: {
              schemaName: schemaName,
              template: template,
              customizations: options.customizations || {}
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Template preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Get available schemas
   * @returns {Object} Available schemas
   */
  getSchemas: function() {
    return ClaimSchemas
  },
  
  /**
   * Get schema names
   * @returns {Array} Available schema names
   */
  getSchemaNames: function() {
    return Object.keys(ClaimSchemas)
  },
  
  /**
   * Get schema definition
   * @param {String} schemaName - Schema name
   * @returns {Object} Schema definition
   */
  getSchema: function(schemaName) {
    return ClaimSchemas[schemaName] || null
  },
  
  /**
   * Add custom schema
   * @param {String} name - Schema name
   * @param {Object} schema - Schema definition
   */
  addSchema: function(name, schema) {
    $.checkArgument(typeof name === 'string', 'Schema name must be string')
    $.checkArgument(schema && typeof schema === 'object', 'Invalid schema')
    
    ClaimSchemas[name] = schema
  },
  
  /**
   * Create claim template
   * @param {String} schemaName - Schema name
   * @returns {Object} Claim template
   */
  createTemplate: function(schemaName) {
    var schema = ClaimSchemas[schemaName]
    if (!schema) {
      throw new Error('Unknown schema: ' + schemaName)
    }
    
    return this._createTemplateFromSchema(schema)
  },
  
  /**
   * Generate dispute ID
   * @private
   */
  _generateDisputeId: function(claimHash) {
    var data = 'dispute_' + claimHash + '_' + Date.now()
    return Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  },
  
  /**
   * Generate batch ID
   * @private
   */
  _generateBatchId: function() {
    var data = 'batch_' + Date.now() + '_' + Math.random()
    return Hash.sha256(Buffer.from(data)).toString('hex').substring(0, 16)
  },
  
  /**
   * Generate form structure from schema
   * @private
   */
  _generateFormStructure: function(schema) {
    var structure = {
      type: 'form',
      title: schema.title || 'Legal Claim Form',
      description: schema.description || '',
      fields: []
    }
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function(key) {
        var prop = schema.properties[key]
        var field = {
          name: key,
          label: this._humanizeFieldName(key),
          type: this._mapSchemaTypeToFormType(prop),
          required: schema.required && schema.required.includes(key),
          validation: this._extractFieldValidation(prop)
        }
        
        if (prop.enum) {
          field.options = prop.enum.map(function(value) {
            return { value: value, label: this._humanizeValue(value) }
          }.bind(this))
        }
        
        structure.fields.push(field)
      }.bind(this))
    }
    
    return structure
  },
  
  /**
   * Extract patterns from schema
   * @private
   */
  _extractPatterns: function(schema) {
    var patterns = {}
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function(key) {
        var prop = schema.properties[key]
        if (prop.pattern) {
          patterns[key] = prop.pattern
        }
      })
    }
    
    return patterns
  },
  
  /**
   * Extract enums from schema
   * @private
   */
  _extractEnums: function(schema) {
    var enums = {}
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function(key) {
        var prop = schema.properties[key]
        if (prop.enum) {
          enums[key] = prop.enum
        }
      })
    }
    
    return enums
  },
  
  /**
   * Map schema type to form type
   * @private
   */
  _mapSchemaTypeToFormType: function(prop) {
    switch (prop.type) {
      case 'string':
        if (prop.enum) return 'select'
        if (prop.format === 'date') return 'date'
        if (prop.format === 'date-time') return 'datetime'
        return 'text'
      case 'number':
      case 'integer':
        return 'number'
      case 'boolean':
        return 'checkbox'
      case 'array':
        return 'list'
      case 'object':
        return 'fieldset'
      default:
        return 'text'
    }
  },
  
  /**
   * Extract field validation rules
   * @private
   */
  _extractFieldValidation: function(prop) {
    var validation = {}
    
    if (prop.pattern) validation.pattern = prop.pattern
    if (prop.minimum !== undefined) validation.min = prop.minimum
    if (prop.maximum !== undefined) validation.max = prop.maximum
    if (prop.format) validation.format = prop.format
    
    return validation
  },
  
  /**
   * Humanize field name
   * @private
   */
  _humanizeFieldName: function(fieldName) {
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, function(str) { return str.toUpperCase() })
      .replace(/_/g, ' ')
  },
  
  /**
   * Humanize enum value
   * @private
   */
  _humanizeValue: function(value) {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function(l) { return l.toUpperCase() })
  },
  
  /**
   * Validate object against schema
   * @private
   */
  _validateObject: function(obj, schema, path, errors, warnings) {
    if (schema.type === 'object') {
      // Check required fields
      if (schema.required && Array.isArray(schema.required)) {
        schema.required.forEach(function(field) {
          if (!obj.hasOwnProperty(field)) {
            errors.push('Missing required field: ' + this._getFieldPath(path, field))
          }
        }.bind(this))
      }
      
      // Validate properties
      if (schema.properties) {
        Object.keys(obj).forEach(function(key) {
          var fieldPath = this._getFieldPath(path, key)
          var fieldSchema = schema.properties[key]
          
          if (fieldSchema) {
            this._validateValue(obj[key], fieldSchema, fieldPath, errors, warnings)
          } else {
            warnings.push('Unknown field: ' + fieldPath)
          }
        }.bind(this))
      }
    } else {
      this._validateValue(obj, schema, path, errors, warnings)
    }
  },
  
  /**
   * Validate value against schema
   * @private
   */
  _validateValue: function(value, schema, path, errors, warnings) {
    // Type validation
    if (schema.type) {
      var actualType = Array.isArray(value) ? 'array' : typeof value
      if (actualType !== schema.type) {
        errors.push('Invalid type for ' + path + ': expected ' + schema.type + ', got ' + actualType)
        return
      }
    }
    
    // String validations
    if (schema.type === 'string') {
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push('Value does not match pattern for ' + path)
      }
      
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push('Invalid enum value for ' + path + ': ' + value)
      }
      
      if (schema.format === 'date' && !this._isValidDate(value)) {
        errors.push('Invalid date format for ' + path)
      }
      
      if (schema.format === 'date-time' && !this._isValidDateTime(value)) {
        errors.push('Invalid date-time format for ' + path)
      }
    }
    
    // Number validations
    if (schema.type === 'number' || schema.type === 'integer') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push('Value below minimum for ' + path + ': ' + value + ' < ' + schema.minimum)
      }
      
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push('Value above maximum for ' + path + ': ' + value + ' > ' + schema.maximum)
      }
      
      if (schema.type === 'integer' && !Number.isInteger(value)) {
        errors.push('Value must be integer for ' + path)
      }
    }
    
    // Array validations
    if (schema.type === 'array' && schema.items) {
      for (var i = 0; i < value.length; i++) {
        this._validateValue(value[i], schema.items, path + '[' + i + ']', errors, warnings)
      }
    }
    
    // Object validations
    if (schema.type === 'object') {
      this._validateObject(value, schema, path, errors, warnings)
    }
  },
  
  /**
   * Sort object keys recursively
   * @private
   */
  _sortObjectKeys: function(obj) {
    if (Array.isArray(obj)) {
      return obj.map(this._sortObjectKeys.bind(this))
    } else if (obj !== null && typeof obj === 'object') {
      var sorted = {}
      Object.keys(obj).sort().forEach(function(key) {
        sorted[key] = this._sortObjectKeys(obj[key])
      }.bind(this))
      return sorted
    }
    return obj
  },
  
  /**
   * Create template from schema
   * @private
   */
  _createTemplateFromSchema: function(schema) {
    if (schema.type === 'object') {
      var template = {}
      
      if (schema.properties) {
        Object.keys(schema.properties).forEach(function(key) {
          var propSchema = schema.properties[key]
          template[key] = this._getDefaultValue(propSchema)
        }.bind(this))
      }
      
      return template
    }
    
    return this._getDefaultValue(schema)
  },
  
  /**
   * Get default value for schema type
   * @private
   */
  _getDefaultValue: function(schema) {
    if (schema.default !== undefined) {
      return schema.default
    }
    
    switch (schema.type) {
      case 'string':
        if (schema.enum) return schema.enum[0]
        if (schema.format === 'date') return '2023-01-01'
        if (schema.format === 'date-time') return new Date().toISOString()
        return 'PLACEHOLDER_STRING'
      
      case 'number':
      case 'integer':
        return schema.minimum || 0
      
      case 'boolean':
        return false
      
      case 'array':
        return []
      
      case 'object':
        return this._createTemplateFromSchema(schema)
      
      default:
        return null
    }
  },
  
  /**
   * Get field path
   * @private
   */
  _getFieldPath: function(basePath, field) {
    return basePath ? basePath + '.' + field : field
  },
  
  /**
   * Validate date format
   * @private
   */
  _isValidDate: function(dateString) {
    var date = new Date(dateString)
    return !isNaN(date.getTime()) && dateString.match(/^\d{4}-\d{2}-\d{2}$/)
  },
  
  /**
   * Validate date-time format
   * @private
   */
  _isValidDateTime: function(dateTimeString) {
    var date = new Date(dateTimeString)
    return !isNaN(date.getTime())
  }
}

module.exports = ClaimValidator