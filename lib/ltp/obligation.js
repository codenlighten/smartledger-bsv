'use strict'

var bsv = require('../../')
var Hash = bsv.crypto.Hash
var ECDSA = bsv.crypto.ECDSA
var PrivateKey = bsv.PrivateKey
var $ = bsv.util.preconditions

/**
 * Legal Token Protocol - Obligation Creation Primitives
 * 
 * Provides primitives for legal obligation token creation, validation, and management
 * without direct blockchain publishing. External systems handle obligation storage
 * and blockchain anchoring operations.
 */

/**
 * Obligation Types
 */
var ObligationTypes = {
  CORRELATIVE_OBLIGATION: 'CorrelativeObligation',
  CONTRACTUAL_OBLIGATION: 'ContractualObligation',
  PAYMENT_OBLIGATION: 'PaymentObligation',
  DELIVERY_OBLIGATION: 'DeliveryObligation',
  PERFORMANCE_OBLIGATION: 'PerformanceObligation',
  MAINTENANCE_OBLIGATION: 'MaintenanceObligation',
  COMPLIANCE_OBLIGATION: 'ComplianceObligation',
  REPORTING_OBLIGATION: 'ReportingObligation',
  CONFIDENTIALITY_OBLIGATION: 'ConfidentialityObligation',
  NON_COMPETE_OBLIGATION: 'NonCompeteObligation',
  INDEMNIFICATION_OBLIGATION: 'IndemnificationObligation',
  WARRANTY_OBLIGATION: 'WarrantyObligation',
  SUPPORT_OBLIGATION: 'SupportObligation',
  REGULATORY_OBLIGATION: 'RegulatoryObligation',
  FIDUCIARY_OBLIGATION: 'FiduciaryObligation'
}

/**
 * Obligation Priority Levels
 */
var ObligationPriority = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  DEFERRED: 'DEFERRED'
}

/**
 * Obligation Status Values
 */
var ObligationStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
  BREACHED: 'BREACHED',
  WAIVED: 'WAIVED',
  TERMINATED: 'TERMINATED'
}

/**
 * Legal Obligation Token
 */
var ObligationToken = {
  
  /**
   * Prepare legal obligation token for external processing
   * @param {String} type - Obligation type (from ObligationTypes)
   * @param {String} issuerDID - Issuer DID
   * @param {String} obligorDID - Obligor DID (who has the obligation)
   * @param {Object} obligation - Obligation details
   * @param {PrivateKey} issuerPrivateKey - Issuer's private key
   * @param {Object} options - Additional options
   * @returns {Object} Prepared legal obligation token data
   */
  prepareObligationToken: function(type, issuerDID, obligorDID, obligation, issuerPrivateKey, options) {
    options = options || {}
    
    $.checkArgument(typeof type === 'string', 'Obligation type must be string')
    $.checkArgument(typeof issuerDID === 'string', 'Issuer DID must be string')
    $.checkArgument(typeof obligorDID === 'string', 'Obligor DID must be string')
    $.checkArgument(obligation && typeof obligation === 'object', 'Obligation must be object')
    $.checkArgument(issuerPrivateKey instanceof PrivateKey, 'Invalid issuer private key')
    
    // Validate obligation type
    var validTypes = Object.values(ObligationTypes)
    $.checkArgument(validTypes.includes(type), 'Invalid obligation type: ' + type)
    
    try {
      var obligationToken = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'LegalObligationToken', type],
        issuer: issuerDID,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: obligorDID,
          obligationType: type,
          obligation: obligation,
          jurisdiction: options.jurisdiction || 'US',
          priority: options.priority || ObligationPriority.MEDIUM,
          status: ObligationStatus.PENDING,
          dueDate: options.dueDate || null,
          effectiveDate: options.effectiveDate || new Date().toISOString(),
          expirationDate: options.expirationDate || null,
          correlativeRight: options.correlativeRight || null,
          rightHolder: options.rightHolder || null,
          enforceable: options.enforceable !== false,
          penalties: options.penalties || null,
          remedies: options.remedies || null
        }
      }
      
      // Add metadata
      if (options.metadata) {
        obligationToken.credentialSubject.metadata = options.metadata
      }
      
      // Sign the token
      var signedToken = this._signToken(obligationToken, issuerPrivateKey)
      
      return {
        success: true,
        obligationToken: signedToken,
        tokenHash: signedToken.tokenHash,
        metadata: {
          type: type,
          issuer: issuerDID,
          obligor: obligorDID,
          priority: obligationToken.credentialSubject.priority,
          status: obligationToken.credentialSubject.status,
          jurisdiction: obligationToken.credentialSubject.jurisdiction,
          dueDate: obligationToken.credentialSubject.dueDate,
          correlativeRight: obligationToken.credentialSubject.correlativeRight
        },
        externalOperations: {
          storeToken: {
            endpoint: 'POST /obligations/tokens',
            data: {
              token: signedToken,
              metadata: {
                type: type,
                issuer: issuerDID,
                obligor: obligorDID,
                priority: obligationToken.credentialSubject.priority,
                status: obligationToken.credentialSubject.status,
                jurisdiction: obligationToken.credentialSubject.jurisdiction,
                dueDate: obligationToken.credentialSubject.dueDate,
                correlativeRight: obligationToken.credentialSubject.correlativeRight
              }
            }
          },
          indexToken: {
            endpoint: 'POST /obligations/index',
            data: {
              tokenId: signedToken.id,
              tokenHash: signedToken.tokenHash,
              type: type,
              issuer: issuerDID,
              obligor: obligorDID,
              issuedAt: signedToken.issuanceDate,
              dueDate: obligationToken.credentialSubject.dueDate,
              priority: obligationToken.credentialSubject.priority
            }
          },
          notifyObligor: {
            endpoint: 'POST /notifications/obligation-issued',
            data: {
              tokenId: signedToken.id,
              issuer: issuerDID,
              obligor: obligorDID,
              obligationType: type,
              dueDate: obligationToken.credentialSubject.dueDate,
              priority: obligationToken.credentialSubject.priority
            }
          },
          scheduleReminders: obligationToken.credentialSubject.dueDate ? {
            endpoint: 'POST /obligations/schedule-reminders',
            data: {
              tokenId: signedToken.id,
              obligor: obligorDID,
              dueDate: obligationToken.credentialSubject.dueDate,
              reminderSchedule: options.reminderSchedule || ['7d', '3d', '1d']
            }
          } : null
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
   * Prepare obligation verification for external processing
   * @param {Object} token - Obligation token to verify
   * @param {Object} options - Verification options
   * @returns {Object} Prepared verification data
   */
  prepareObligationVerification: function(token, options) {
    options = options || {}
    
    try {
      var errors = []
      var warnings = []
      
      // Basic structure validation
      this._validateTokenStructure(token, errors)
      
      // Signature verification
      this._verifyTokenSignature(token, errors)
      
      // Temporal validation
      this._validateTokenTemporal(token, errors, warnings)
      
      // Type validation
      this._validateObligationType(token, errors)
      
      // Status validation
      this._validateObligationStatus(token, errors, warnings)
      
      // Priority validation
      this._validateObligationPriority(token, warnings)
      
      var verification = {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        issuerDID: token.issuer,
        obligorDID: token.credentialSubject ? token.credentialSubject.id : null,
        obligationType: token.credentialSubject ? token.credentialSubject.obligationType : null,
        status: token.credentialSubject ? token.credentialSubject.status : null,
        priority: token.credentialSubject ? token.credentialSubject.priority : null,
        isOverdue: this._checkIfOverdue(token),
        verifiedAt: new Date().toISOString()
      }
      
      return {
        success: true,
        verification: verification,
        externalOperations: {
          recordVerification: {
            endpoint: 'POST /obligations/verification-record',
            data: {
              tokenId: token.id,
              result: verification.valid,
              errors: errors,
              warnings: warnings,
              verifiedAt: verification.verifiedAt,
              isOverdue: verification.isOverdue
            }
          },
          auditVerification: {
            endpoint: 'POST /audit/obligation-verification',
            data: {
              tokenId: token.id,
              obligationType: verification.obligationType,
              issuer: verification.issuerDID,
              obligor: verification.obligorDID,
              result: verification.valid,
              verifiedAt: verification.verifiedAt
            }
          },
          updateStatus: verification.isOverdue && token.credentialSubject.status === ObligationStatus.ACTIVE ? {
            endpoint: 'PUT /obligations/tokens/' + token.id + '/status',
            data: {
              status: ObligationStatus.OVERDUE,
              updatedAt: verification.verifiedAt,
              reason: 'Due date passed'
            }
          } : null
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Verification preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Prepare obligation fulfillment for external processing
   * @param {Object} token - Obligation token
   * @param {Object} fulfillment - Fulfillment details
   * @param {PrivateKey} obligorKey - Obligor's private key
   * @param {Object} options - Fulfillment options
   * @returns {Object} Prepared fulfillment data
   */
  prepareObligationFulfillment: function(token, fulfillment, obligorKey, options) {
    options = options || {}
    
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(fulfillment && typeof fulfillment === 'object', 'Invalid fulfillment')
    $.checkArgument(obligorKey instanceof PrivateKey, 'Invalid obligor key')
    
    try {
      // Verify current token
      var verification = this.prepareObligationVerification(token, {})
      if (!verification.success || !verification.verification.valid) {
        return {
          success: false,
          error: 'Cannot fulfill invalid obligation: ' + verification.verification.errors.join(', ')
        }
      }
      
      // Check if obligation can be fulfilled
      if (token.credentialSubject.status === ObligationStatus.COMPLETED) {
        return {
          success: false,
          error: 'Obligation already fulfilled'
        }
      }
      
      if (token.credentialSubject.status === ObligationStatus.TERMINATED) {
        return {
          success: false,
          error: 'Obligation has been terminated'
        }
      }
      
      // Create fulfillment record
      var fulfillmentRecord = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'ObligationFulfillment'],
        issuer: token.credentialSubject.id, // Obligor
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: token.id, // References the obligation
          fulfillmentType: fulfillment.type || 'FULL_FULFILLMENT',
          fulfillmentDate: new Date().toISOString(),
          evidence: fulfillment.evidence || null,
          description: fulfillment.description || '',
          completionPercentage: fulfillment.completionPercentage || 100,
          attestations: fulfillment.attestations || [],
          notes: fulfillment.notes || null
        }
      }
      
      // Sign fulfillment with obligor key
      var signedFulfillment = this._signToken(fulfillmentRecord, obligorKey)
      
      // Determine new obligation status
      var newStatus = fulfillmentRecord.credentialSubject.completionPercentage >= 100 ? 
        ObligationStatus.COMPLETED : 
        ObligationStatus.IN_PROGRESS
      
      return {
        success: true,
        fulfillmentRecord: signedFulfillment,
        newStatus: newStatus,
        fulfillmentId: signedFulfillment.id,
        externalOperations: {
          recordFulfillment: {
            endpoint: 'POST /obligations/fulfillments',
            data: {
              obligationId: token.id,
              fulfillmentRecord: signedFulfillment,
              obligor: token.credentialSubject.id,
              fulfillmentDate: fulfillmentRecord.credentialSubject.fulfillmentDate,
              completionPercentage: fulfillmentRecord.credentialSubject.completionPercentage
            }
          },
          updateStatus: {
            endpoint: 'PUT /obligations/tokens/' + token.id + '/status',
            data: {
              status: newStatus,
              fulfillmentId: signedFulfillment.id,
              updatedAt: fulfillmentRecord.credentialSubject.fulfillmentDate,
              completionPercentage: fulfillmentRecord.credentialSubject.completionPercentage
            }
          },
          notifyRightHolder: token.credentialSubject.rightHolder ? {
            endpoint: 'POST /notifications/obligation-fulfilled',
            data: {
              obligationId: token.id,
              fulfillmentId: signedFulfillment.id,
              obligor: token.credentialSubject.id,
              rightHolder: token.credentialSubject.rightHolder,
              completionPercentage: fulfillmentRecord.credentialSubject.completionPercentage,
              newStatus: newStatus
            }
          } : null,
          auditFulfillment: {
            endpoint: 'POST /audit/obligation-fulfillment',
            data: {
              obligationId: token.id,
              fulfillmentId: signedFulfillment.id,
              obligor: token.credentialSubject.id,
              fulfilledAt: fulfillmentRecord.credentialSubject.fulfillmentDate,
              completionPercentage: fulfillmentRecord.credentialSubject.completionPercentage
            }
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
   * Prepare obligation breach assessment for external processing
   * @param {Object} token - Obligation token
   * @param {Object} breach - Breach details
   * @param {Object} assessor - Assessor information
   * @returns {Object} Prepared breach assessment data
   */
  prepareObligationBreachAssessment: function(token, breach, assessor) {
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(breach && typeof breach === 'object', 'Invalid breach details')
    $.checkArgument(assessor && typeof assessor === 'object', 'Invalid assessor')
    
    try {
      var breachAssessment = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'ObligationBreachAssessment'],
        issuer: assessor.did || assessor.id,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: token.id, // References the obligation
          breachType: breach.type || 'MATERIAL_BREACH',
          breachDate: breach.date || new Date().toISOString(),
          description: breach.description || '',
          severity: breach.severity || 'MODERATE',
          evidence: breach.evidence || [],
          assessor: {
            did: assessor.did || assessor.id,
            name: assessor.name || 'Unknown',
            authority: assessor.authority || null,
            jurisdiction: assessor.jurisdiction || null
          },
          damages: breach.damages || null,
          recommendedRemedies: breach.recommendedRemedies || [],
          assessmentDate: new Date().toISOString()
        }
      }
      
      var breachHash = Hash.sha256(Buffer.from(JSON.stringify(breachAssessment))).toString('hex')
      breachAssessment.credentialSubject.assessmentHash = breachHash
      
      return {
        success: true,
        breachAssessment: breachAssessment,
        breachId: breachAssessment.id,
        severity: breach.severity || 'MODERATE',
        externalOperations: {
          recordBreach: {
            endpoint: 'POST /obligations/breaches',
            data: {
              obligationId: token.id,
              breachAssessment: breachAssessment,
              obligor: token.credentialSubject.id,
              rightHolder: token.credentialSubject.rightHolder,
              breachDate: breach.date || new Date().toISOString(),
              severity: breach.severity || 'MODERATE'
            }
          },
          updateStatus: {
            endpoint: 'PUT /obligations/tokens/' + token.id + '/status',
            data: {
              status: ObligationStatus.BREACHED,
              breachId: breachAssessment.id,
              breachDate: breach.date || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          },
          notifyParties: {
            endpoint: 'POST /notifications/obligation-breached',
            data: {
              obligationId: token.id,
              breachId: breachAssessment.id,
              obligor: token.credentialSubject.id,
              rightHolder: token.credentialSubject.rightHolder,
              breachType: breach.type || 'MATERIAL_BREACH',
              severity: breach.severity || 'MODERATE'
            }
          },
          escalateBreach: breach.severity === 'CRITICAL' ? {
            endpoint: 'POST /legal/escalate-breach',
            data: {
              obligationId: token.id,
              breachId: breachAssessment.id,
              severity: breach.severity,
              jurisdiction: token.credentialSubject.jurisdiction
            }
          } : null,
          auditBreach: {
            endpoint: 'POST /audit/obligation-breach',
            data: {
              obligationId: token.id,
              breachId: breachAssessment.id,
              obligor: token.credentialSubject.id,
              assessedAt: breachAssessment.credentialSubject.assessmentDate,
              severity: breach.severity || 'MODERATE'
            }
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
   * Prepare obligation monitoring report for external processing
   * @param {Array} obligations - Array of obligation tokens
   * @param {Object} criteria - Monitoring criteria
   * @returns {Object} Prepared monitoring report data
   */
  prepareObligationMonitoringReport: function(obligations, criteria) {
    criteria = criteria || {}
    
    $.checkArgument(Array.isArray(obligations), 'Obligations must be array')
    
    try {
      var report = {
        reportId: 'rpt_' + this._generateUUID(),
        generatedAt: new Date().toISOString(),
        criteria: criteria,
        summary: {
          totalObligations: obligations.length,
          byStatus: {},
          byPriority: {},
          byType: {},
          overdue: 0,
          dueSoon: 0,
          completed: 0
        },
        obligations: [],
        alerts: [],
        recommendations: []
      }
      
      var now = new Date()
      var sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
      
      obligations.forEach(function(obligation) {
        var obligationData = {
          id: obligation.id,
          type: obligation.credentialSubject.obligationType,
          status: obligation.credentialSubject.status,
          priority: obligation.credentialSubject.priority,
          obligor: obligation.credentialSubject.id,
          dueDate: obligation.credentialSubject.dueDate,
          isOverdue: this._checkIfOverdue(obligation),
          isDueSoon: false
        }
        
        // Check if due soon
        if (obligation.credentialSubject.dueDate) {
          var dueDate = new Date(obligation.credentialSubject.dueDate)
          obligationData.isDueSoon = dueDate <= sevenDaysFromNow && dueDate > now
        }
        
        // Update summaries
        report.summary.byStatus[obligationData.status] = (report.summary.byStatus[obligationData.status] || 0) + 1
        report.summary.byPriority[obligationData.priority] = (report.summary.byPriority[obligationData.priority] || 0) + 1
        report.summary.byType[obligationData.type] = (report.summary.byType[obligationData.type] || 0) + 1
        
        if (obligationData.isOverdue) report.summary.overdue++
        if (obligationData.isDueSoon) report.summary.dueSoon++
        if (obligationData.status === ObligationStatus.COMPLETED) report.summary.completed++
        
        // Generate alerts
        if (obligationData.isOverdue && obligationData.priority === ObligationPriority.CRITICAL) {
          report.alerts.push({
            type: 'CRITICAL_OVERDUE',
            obligationId: obligation.id,
            message: 'Critical obligation is overdue',
            priority: 'HIGH'
          })
        }
        
        if (obligationData.isDueSoon && obligationData.priority === ObligationPriority.HIGH) {
          report.alerts.push({
            type: 'HIGH_PRIORITY_DUE_SOON',
            obligationId: obligation.id,
            message: 'High priority obligation due soon',
            priority: 'MEDIUM'
          })
        }
        
        report.obligations.push(obligationData)
      }.bind(this))
      
      // Generate recommendations
      if (report.summary.overdue > 0) {
        report.recommendations.push({
          type: 'OVERDUE_MANAGEMENT',
          message: 'Consider prioritizing overdue obligations',
          count: report.summary.overdue
        })
      }
      
      if (report.summary.dueSoon > 5) {
        report.recommendations.push({
          type: 'WORKLOAD_MANAGEMENT',
          message: 'High number of obligations due soon - consider workload distribution',
          count: report.summary.dueSoon
        })
      }
      
      return {
        success: true,
        report: report,
        externalOperations: {
          storeReport: {
            endpoint: 'POST /obligations/monitoring-reports',
            data: {
              report: report,
              generatedAt: report.generatedAt
            }
          },
          sendAlerts: report.alerts.length > 0 ? {
            endpoint: 'POST /notifications/obligation-alerts',
            data: {
              reportId: report.reportId,
              alerts: report.alerts,
              summary: report.summary
            }
          } : null,
          updateDashboard: {
            endpoint: 'PUT /dashboard/obligation-metrics',
            data: {
              summary: report.summary,
              lastUpdated: report.generatedAt
            }
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
   * Get available obligation types
   * @returns {Object} Obligation types
   */
  getObligationTypes: function() {
    return ObligationTypes
  },
  
  /**
   * Get obligation priority levels
   * @returns {Object} Priority levels
   */
  getObligationPriority: function() {
    return ObligationPriority
  },
  
  /**
   * Get obligation status values
   * @returns {Object} Status values
   */
  getObligationStatus: function() {
    return ObligationStatus
  },
  
  /**
   * Sign a token with private key
   * @private
   */
  _signToken: function(token, privateKey) {
    // Create canonical hash
    var canonicalToken = this._canonicalizeToken(token)
    var tokenHash = Hash.sha256(Buffer.from(canonicalToken))
    
    // Sign with ECDSA
    var ecdsa = new ECDSA()
    ecdsa.hashbuf = tokenHash
    ecdsa.privkey = privateKey
    ecdsa.pubkey = privateKey.toPublicKey()
    
    ecdsa.sign()
    var signature = ecdsa.sig
    
    // Create proof
    var proof = {
      type: 'EcdsaSecp256k1Signature2019',
      created: new Date().toISOString(),
      verificationMethod: 'did:smartledger:' + privateKey.toPublicKey().toString() + '#keys-1',
      proofPurpose: 'assertionMethod',
      jws: this._createJWS(tokenHash, signature)
    }
    
    // Add proof to token
    var signedToken = JSON.parse(JSON.stringify(token))
    signedToken.proof = proof
    signedToken.tokenHash = tokenHash.toString('hex')
    
    return signedToken
  },
  
  /**
   * Create JWS signature
   * @private
   */
  _createJWS: function(hash, signature) {
    var header = {
      alg: 'ES256K',
      typ: 'JWT'
    }
    
    var headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    var payloadB64 = hash.toString('base64url')
    var signatureB64 = signature.toDER().toString('base64url')
    
    return headerB64 + '..' + signatureB64
  },
  
  /**
   * Canonicalize token for hashing
   * @private
   */
  _canonicalizeToken: function(token) {
    // Remove proof and hash fields
    var canonical = JSON.parse(JSON.stringify(token))
    delete canonical.proof
    delete canonical.tokenHash
    
    // Sort keys recursively
    return JSON.stringify(this._sortObjectKeys(canonical))
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
   * Validate token structure
   * @private
   */
  _validateTokenStructure: function(token, errors) {
    if (!token['@context']) {
      errors.push('Missing @context')
    }
    
    if (!token.id) {
      errors.push('Missing id')
    }
    
    if (!token.type || !Array.isArray(token.type)) {
      errors.push('Missing or invalid type')
    }
    
    if (!token.issuer) {
      errors.push('Missing issuer')
    }
    
    if (!token.issuanceDate) {
      errors.push('Missing issuanceDate')
    }
    
    if (!token.credentialSubject) {
      errors.push('Missing credentialSubject')
    }
    
    if (!token.proof) {
      errors.push('Missing proof')
    }
  },
  
  /**
   * Verify token signature
   * @private
   */
  _verifyTokenSignature: function(token, errors) {
    try {
      if (!token.proof || !token.proof.jws) {
        errors.push('Missing signature proof')
        return
      }
      
      // Recreate canonical hash
      var canonicalToken = this._canonicalizeToken(token)
      var expectedHash = Hash.sha256(Buffer.from(canonicalToken))
      
      // Compare with stored hash if available
      if (token.tokenHash && token.tokenHash !== expectedHash.toString('hex')) {
        errors.push('Token hash mismatch')
        return
      }
      
      // TODO: Verify JWS signature with issuer's public key
      // This would require DID resolution to get the public key
      
    } catch (error) {
      errors.push('Signature verification failed: ' + error.message)
    }
  },
  
  /**
   * Validate temporal aspects
   * @private
   */
  _validateTokenTemporal: function(token, errors, warnings) {
    var now = new Date()
    var issuanceDate = new Date(token.issuanceDate)
    
    if (issuanceDate > now) {
      errors.push('Token issued in the future')
    }
    
    if (token.credentialSubject.effectiveDate) {
      var effectiveDate = new Date(token.credentialSubject.effectiveDate)
      if (now < effectiveDate) {
        warnings.push('Obligation not yet effective')
      }
    }
    
    if (token.credentialSubject.expirationDate) {
      var expirationDate = new Date(token.credentialSubject.expirationDate)
      if (now > expirationDate) {
        errors.push('Obligation expired')
      }
    }
  },
  
  /**
   * Validate obligation type
   * @private
   */
  _validateObligationType: function(token, errors) {
    if (!token.credentialSubject.obligationType) {
      errors.push('Missing obligationType')
      return
    }
    
    var validTypes = Object.values(ObligationTypes)
    if (!validTypes.includes(token.credentialSubject.obligationType)) {
      errors.push('Invalid obligation type: ' + token.credentialSubject.obligationType)
    }
  },
  
  /**
   * Validate obligation status
   * @private
   */
  _validateObligationStatus: function(token, errors, warnings) {
    if (!token.credentialSubject.status) {
      errors.push('Missing status')
      return
    }
    
    var validStatuses = Object.values(ObligationStatus)
    if (!validStatuses.includes(token.credentialSubject.status)) {
      errors.push('Invalid obligation status: ' + token.credentialSubject.status)
    }
    
    // Check for overdue obligations
    if (this._checkIfOverdue(token) && token.credentialSubject.status === ObligationStatus.ACTIVE) {
      warnings.push('Obligation is overdue but status is still ACTIVE')
    }
  },
  
  /**
   * Validate obligation priority
   * @private
   */
  _validateObligationPriority: function(token, warnings) {
    if (token.credentialSubject.priority) {
      var validPriorities = Object.values(ObligationPriority)
      if (!validPriorities.includes(token.credentialSubject.priority)) {
        warnings.push('Invalid obligation priority: ' + token.credentialSubject.priority)
      }
    }
  },
  
  /**
   * Check if obligation is overdue
   * @private
   */
  _checkIfOverdue: function(token) {
    if (!token.credentialSubject.dueDate) {
      return false
    }
    
    var now = new Date()
    var dueDate = new Date(token.credentialSubject.dueDate)
    
    return now > dueDate && token.credentialSubject.status !== ObligationStatus.COMPLETED
  },
  
  /**
   * Generate UUID
   * @private
   */
  _generateUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0
      var v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}

// Export static references for compatibility
ObligationToken.ObligationTypes = ObligationTypes
ObligationToken.ObligationPriority = ObligationPriority
ObligationToken.ObligationStatus = ObligationStatus

module.exports = ObligationToken