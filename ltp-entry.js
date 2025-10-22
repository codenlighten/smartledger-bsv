/**
 * SmartLedger-BSV Legal Token Protocol (LTP) - Standalone Entry Point
 * 
 * This entry point provides the complete Legal Token Protocol framework
 * as a standalone module for browser and Node.js environments.
 * 
 * Features:
 * - Complete LTP primitives-only architecture
 * - Legal claim validation and attestation
 * - Right and obligation token management
 * - Cryptographic proof generation
 * - Registry and blockchain anchoring preparation
 * - Full W3C compatibility and legal compliance
 */

const bsv = require('./index.js')

// Export LTP functionality as standalone module
module.exports = {
  // Core BSV functionality needed for LTP
  PrivateKey: bsv.PrivateKey,
  PublicKey: bsv.PublicKey,
  Address: bsv.Address,
  Transaction: bsv.Transaction,
  Script: bsv.Script,
  crypto: bsv.crypto,
  
  // Complete LTP framework
  LTP: bsv.LTP,
  
  // Right Token Primitives
  prepareRightToken: bsv.prepareRightToken,
  prepareRightTokenVerification: bsv.prepareRightTokenVerification,
  prepareRightTokenTransfer: bsv.prepareRightTokenTransfer,
  prepareRightTypeValidation: bsv.prepareRightTypeValidation,
  
  // Obligation Token Primitives
  prepareObligationToken: bsv.prepareObligationToken,
  prepareObligationVerification: bsv.prepareObligationVerification,
  prepareObligationFulfillment: bsv.prepareObligationFulfillment,
  prepareObligationBreachAssessment: bsv.prepareObligationBreachAssessment,
  prepareObligationMonitoringReport: bsv.prepareObligationMonitoringReport,
  
  // Claim Validation Primitives
  prepareClaimValidation: bsv.prepareClaimValidation,
  prepareClaimAttestation: bsv.prepareClaimAttestation,
  prepareClaimDispute: bsv.prepareClaimDispute,
  prepareBulkClaimValidation: bsv.prepareBulkClaimValidation,
  prepareClaimTemplate: bsv.prepareClaimTemplate,
  
  // Proof Generation Primitives
  prepareSignatureProof: bsv.prepareSignatureProof,
  prepareSignatureVerification: bsv.prepareSignatureVerification,
  prepareSelectiveDisclosure: bsv.prepareSelectiveDisclosure,
  prepareSelectiveDisclosureVerification: bsv.prepareSelectiveDisclosureVerification,
  prepareLegalValidityProof: bsv.prepareLegalValidityProof,
  prepareZeroKnowledgeProof: bsv.prepareZeroKnowledgeProof,
  
  // Registry Management Primitives
  prepareRegistry: bsv.prepareRegistry,
  prepareTokenRegistration: bsv.prepareTokenRegistration,
  prepareTokenApproval: bsv.prepareTokenApproval,
  prepareTokenRevocation: bsv.prepareTokenRevocation,
  prepareTokenStatusQuery: bsv.prepareTokenStatusQuery,
  prepareTokenSearch: bsv.prepareTokenSearch,
  prepareStatisticsQuery: bsv.prepareStatisticsQuery,
  prepareAuditLogQuery: bsv.prepareAuditLogQuery,
  
  // Blockchain Anchoring Primitives
  prepareTokenCommitment: bsv.prepareTokenCommitment,
  prepareBatchCommitment: bsv.prepareBatchCommitment,
  verifyTokenAnchor: bsv.verifyTokenAnchor,
  formatRevocation: bsv.formatRevocation,
  
  // Utility Functions
  getRightTypes: bsv.getRightTypes,
  getObligationTypes: bsv.getObligationTypes,
  getObligationPriority: bsv.getObligationPriority,
  getObligationStatus: bsv.getObligationStatus,
  getClaimSchemas: bsv.getClaimSchemas,
  getClaimSchemaNames: bsv.getClaimSchemaNames,
  getClaimSchema: bsv.getClaimSchema,
  createClaimTemplate: bsv.createClaimTemplate,
  canonicalizeClaim: bsv.canonicalizeClaim,
  hashClaim: bsv.hashClaim,
  addCustomClaimSchema: bsv.addCustomClaimSchema,
  
  // Version and metadata
  version: '3.3.0',
  framework: 'Legal Token Protocol',
  architecture: 'primitives-only'
}