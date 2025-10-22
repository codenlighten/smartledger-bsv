'use strict'

var $ = require('../util/preconditions')

/**
 * VC Schema System
 * 
 * Provides W3C Verifiable Credential schema definitions and validation
 * for the Global Digital Attestation Framework (GDAF). Includes
 * predefined schemas for common credential types and custom schema
 * validation capabilities.
 */

/**
 * Schema definitions
 */
var schemas = {
  // Email Verification Credential
  EmailVerifiedCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/email/v1'
    ],
    type: ['VerifiableCredential', 'EmailVerifiedCredential'],
    requiredFields: [
      'credentialSubject.email',
      'credentialSubject.verified'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['email', 'verified'],
        properties: {
          email: {
            type: 'string',
            format: 'email'
          },
          verified: {
            type: 'boolean'
          },
          verificationMethod: {
            type: 'string'
          },
          verificationTimestamp: {
            type: 'string',
            format: 'date-time'
          }
        }
      }
    }
  },

  // Age Verification Credential
  AgeVerifiedCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/age/v1'
    ],
    type: ['VerifiableCredential', 'AgeVerifiedCredential'],
    requiredFields: [
      'credentialSubject.ageOver',
      'credentialSubject.verified'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['ageOver', 'verified'],
        properties: {
          ageOver: {
            type: 'number',
            minimum: 0,
            maximum: 150
          },
          verified: {
            type: 'boolean'
          },
          birthDateHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          },
          verificationMethod: {
            type: 'string'
          }
        }
      }
    }
  },

  // KYC Verification Credential
  KYCVerifiedCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/kyc/v1'
    ],
    type: ['VerifiableCredential', 'KYCVerifiedCredential'],
    requiredFields: [
      'credentialSubject.kycLevel',
      'credentialSubject.verified',
      'credentialSubject.verifyingAuthority'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['kycLevel', 'verified', 'verifyingAuthority'],
        properties: {
          kycLevel: {
            type: 'string',
            enum: ['basic', 'enhanced', 'premium', 'institutional']
          },
          verified: {
            type: 'boolean'
          },
          verifyingAuthority: {
            type: 'string'
          },
          verificationTimestamp: {
            type: 'string',
            format: 'date-time'
          },
          firstNameHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          },
          lastNameHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          },
          ssnHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          }
        }
      }
    }
  },

  // Organization Credential
  OrganizationCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/organization/v1'
    ],
    type: ['VerifiableCredential', 'OrganizationCredential'],
    requiredFields: [
      'credentialSubject.name',
      'credentialSubject.type',
      'credentialSubject.verified'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['name', 'type', 'verified'],
        properties: {
          name: {
            type: 'string'
          },
          type: {
            type: 'string',
            enum: ['Corporation', 'LLC', 'Partnership', 'NGO', 'Government', 'Other']
          },
          verified: {
            type: 'boolean'
          },
          taxIdHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          },
          incorporationState: {
            type: 'string'
          },
          industry: {
            type: 'string'
          },
          verificationMethod: {
            type: 'string'
          },
          verificationTimestamp: {
            type: 'string',
            format: 'date-time'
          }
        }
      }
    }
  },

  // SSN Verification Credential
  SSNVerifiedCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/ssn/v1'
    ],
    type: ['VerifiableCredential', 'SSNVerifiedCredential'],
    requiredFields: [
      'credentialSubject.ssnHash',
      'credentialSubject.verified',
      'credentialSubject.verifyingAuthority'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['ssnHash', 'verified', 'verifyingAuthority'],
        properties: {
          ssnHash: {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$'
          },
          verified: {
            type: 'boolean'
          },
          verifyingAuthority: {
            type: 'string'
          },
          verificationTimestamp: {
            type: 'string',
            format: 'date-time'
          },
          issuingState: {
            type: 'string'
          }
        }
      }
    }
  },

  // Educational Credential
  EducationalCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/education/v1'
    ],
    type: ['VerifiableCredential', 'EducationalCredential'],
    requiredFields: [
      'credentialSubject.degree',
      'credentialSubject.institution',
      'credentialSubject.graduationDate'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['degree', 'institution', 'graduationDate'],
        properties: {
          degree: {
            type: 'string'
          },
          institution: {
            type: 'string'
          },
          graduationDate: {
            type: 'string',
            format: 'date'
          },
          gpa: {
            type: 'number',
            minimum: 0.0,
            maximum: 4.0
          },
          major: {
            type: 'string'
          },
          honors: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      }
    }
  },

  // Professional License Credential
  ProfessionalLicenseCredential: {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://smartledger.technology/contexts/license/v1'
    ],
    type: ['VerifiableCredential', 'ProfessionalLicenseCredential'],
    requiredFields: [
      'credentialSubject.licenseType',
      'credentialSubject.licenseNumber',
      'credentialSubject.issuingAuthority',
      'credentialSubject.isValid'
    ],
    properties: {
      credentialSubject: {
        type: 'object',
        required: ['licenseType', 'licenseNumber', 'issuingAuthority', 'isValid'],
        properties: {
          licenseType: {
            type: 'string'
          },
          licenseNumber: {
            type: 'string'
          },
          issuingAuthority: {
            type: 'string'
          },
          issuingState: {
            type: 'string'
          },
          isValid: {
            type: 'boolean'
          },
          issueDate: {
            type: 'string',
            format: 'date'
          },
          expirationDate: {
            type: 'string',
            format: 'date'
          }
        }
      }
    }
  }
}

/**
 * Schema validator
 */
var SchemaValidator = {
  
  /**
   * Get schema by credential type
   * @param {String} credentialType - Type of credential
   * @returns {Object} Schema definition
   */
  getSchema: function(credentialType) {
    return schemas[credentialType] || null
  },

  /**
   * Get all available schemas
   * @returns {Object} All schema definitions
   */
  getAllSchemas: function() {
    return schemas
  },

  /**
   * Validate credential against schema
   * @param {Object} credential - Credential to validate
   * @param {String|Object} schema - Schema name or definition
   * @returns {Object} Validation result
   */
  validate: function(credential, schema) {
    try {
      $.checkArgument(credential && typeof credential === 'object', 'Invalid credential')
      
      var schemaDefinition
      if (typeof schema === 'string') {
        schemaDefinition = schemas[schema]
        if (!schemaDefinition) {
          return {
            valid: false,
            errors: ['Unknown schema type: ' + schema]
          }
        }
      } else if (typeof schema === 'object') {
        schemaDefinition = schema
      } else {
        return {
          valid: false,
          errors: ['Invalid schema parameter']
        }
      }
      
      var errors = []
      var warnings = []
      
      // Validate required credential structure
      this._validateCredentialStructure(credential, errors)
      
      // Validate credential types
      this._validateCredentialTypes(credential, schemaDefinition, errors)
      
      // Validate required fields
      this._validateRequiredFields(credential, schemaDefinition, errors)
      
      // Validate field properties
      this._validateFieldProperties(credential, schemaDefinition, errors, warnings)
      
      return {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings
      }
      
    } catch (error) {
      return {
        valid: false,
        errors: ['Schema validation error: ' + error.message]
      }
    }
  },

  /**
   * Validate basic credential structure
   * @private
   */
  _validateCredentialStructure: function(credential, errors) {
    if (!credential['@context']) {
      errors.push('Missing @context')
    }
    
    if (!credential.type) {
      errors.push('Missing type')
    }
    
    if (!credential.issuer) {
      errors.push('Missing issuer')
    }
    
    if (!credential.issuanceDate) {
      errors.push('Missing issuanceDate')
    }
    
    if (!credential.credentialSubject) {
      errors.push('Missing credentialSubject')
    }
  },

  /**
   * Validate credential types
   * @private
   */
  _validateCredentialTypes: function(credential, schema, errors) {
    if (!Array.isArray(credential.type)) {
      errors.push('Credential type must be array')
      return
    }
    
    if (schema.type && Array.isArray(schema.type)) {
      for (var i = 0; i < schema.type.length; i++) {
        if (!credential.type.includes(schema.type[i])) {
          errors.push('Missing required type: ' + schema.type[i])
        }
      }
    }
  },

  /**
   * Validate required fields
   * @private
   */
  _validateRequiredFields: function(credential, schema, errors) {
    if (schema.requiredFields && Array.isArray(schema.requiredFields)) {
      for (var i = 0; i < schema.requiredFields.length; i++) {
        var fieldPath = schema.requiredFields[i]
        var value = this._getNestedProperty(credential, fieldPath)
        
        if (value === undefined || value === null) {
          errors.push('Missing required field: ' + fieldPath)
        }
      }
    }
  },

  /**
   * Validate field properties
   * @private
   */
  _validateFieldProperties: function(credential, schema, errors, warnings) {
    if (schema.properties && schema.properties.credentialSubject) {
      this._validateObjectProperties(
        credential.credentialSubject,
        schema.properties.credentialSubject,
        'credentialSubject',
        errors,
        warnings
      )
    }
  },

  /**
   * Validate object properties recursively
   * @private
   */
  _validateObjectProperties: function(obj, schema, path, errors, warnings) {
    if (!obj || typeof obj !== 'object') {
      return
    }
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(function(prop) {
        var value = obj[prop]
        var propSchema = schema.properties[prop]
        var propPath = path + '.' + prop
        
        if (value !== undefined && value !== null) {
          this._validateProperty(value, propSchema, propPath, errors, warnings)
        }
      }.bind(this))
    }
  },

  /**
   * Validate individual property
   * @private
   */
  _validateProperty: function(value, schema, path, errors, warnings) {
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
      if (schema.format === 'email' && !this._isValidEmail(value)) {
        errors.push('Invalid email format for ' + path)
      }
      
      if (schema.format === 'date' && !this._isValidDate(value)) {
        errors.push('Invalid date format for ' + path)
      }
      
      if (schema.format === 'date-time' && !this._isValidDateTime(value)) {
        errors.push('Invalid date-time format for ' + path)
      }
      
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push('Value does not match pattern for ' + path)
      }
      
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push('Invalid enum value for ' + path + ': ' + value)
      }
    }
    
    // Number validations
    if (schema.type === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push('Value below minimum for ' + path + ': ' + value + ' < ' + schema.minimum)
      }
      
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push('Value above maximum for ' + path + ': ' + value + ' > ' + schema.maximum)
      }
    }
    
    // Array validations
    if (schema.type === 'array' && schema.items) {
      for (var i = 0; i < value.length; i++) {
        this._validateProperty(value[i], schema.items, path + '[' + i + ']', errors, warnings)
      }
    }
  },

  /**
   * Get nested property value
   * @private
   */
  _getNestedProperty: function(obj, path) {
    return path.split('.').reduce(function(current, prop) {
      return current && current[prop]
    }, obj)
  },

  /**
   * Validate email format
   * @private
   */
  _isValidEmail: function(email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  },

  /**
   * Validate date format (YYYY-MM-DD)
   * @private
   */
  _isValidDate: function(dateString) {
    var date = new Date(dateString)
    return !isNaN(date.getTime()) && dateString.match(/^\d{4}-\d{2}-\d{2}$/)
  },

  /**
   * Validate date-time format (ISO 8601)
   * @private
   */
  _isValidDateTime: function(dateTimeString) {
    var date = new Date(dateTimeString)
    return !isNaN(date.getTime())
  },

  /**
   * Add custom schema
   * @param {String} name - Schema name
   * @param {Object} definition - Schema definition
   */
  addSchema: function(name, definition) {
    $.checkArgument(typeof name === 'string', 'Schema name must be string')
    $.checkArgument(definition && typeof definition === 'object', 'Invalid schema definition')
    
    schemas[name] = definition
  },

  /**
   * Create schema template
   * @param {String} credentialType - Type of credential
   * @returns {Object} Template credential
   */
  createTemplate: function(credentialType) {
    var schema = schemas[credentialType]
    if (!schema) {
      throw new Error('Unknown credential type: ' + credentialType)
    }
    
    var template = {
      '@context': schema['@context'] || ['https://www.w3.org/2018/credentials/v1'],
      type: schema.type || ['VerifiableCredential'],
      issuer: 'did:smartledger:ISSUER_DID_HERE',
      issuanceDate: new Date().toISOString(),
      credentialSubject: this._createSubjectTemplate(schema.properties ? schema.properties.credentialSubject : {})
    }
    
    return template
  },

  /**
   * Create subject template from schema
   * @private
   */
  _createSubjectTemplate: function(subjectSchema) {
    var template = {
      id: 'SUBJECT_ID_HERE'
    }
    
    if (subjectSchema.properties) {
      Object.keys(subjectSchema.properties).forEach(function(prop) {
        var propSchema = subjectSchema.properties[prop]
        template[prop] = this._getDefaultValue(propSchema)
      }.bind(this))
    }
    
    return template
  },

  /**
   * Get default value for property type
   * @private
   */
  _getDefaultValue: function(schema) {
    switch (schema.type) {
      case 'string':
        if (schema.enum) {
          return schema.enum[0]
        }
        if (schema.format === 'email') {
          return 'example@example.com'
        }
        if (schema.format === 'date') {
          return '2023-01-01'
        }
        if (schema.format === 'date-time') {
          return new Date().toISOString()
        }
        return 'PLACEHOLDER_STRING'
      
      case 'number':
        return schema.minimum || 0
      
      case 'boolean':
        return true
      
      case 'array':
        return []
      
      case 'object':
        return {}
      
      default:
        return null
    }
  }
}

module.exports = SchemaValidator