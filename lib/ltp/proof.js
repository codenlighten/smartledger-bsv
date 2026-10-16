'use strict'

var PublicKey = require('../publickey')
var Hash = require('../crypto/hash')
var ECDSA = require('../crypto/ecdsa')
var Signature = require('../crypto/signature')
var PrivateKey = require('../privatekey')
var $ = require('../util/preconditions')
var FieldCommit = require('../util/field-commit')
var Random = require('../crypto/random')
var deprecate = require('../util/deprecate')

/**
 * Legal Token Protocol - Proof Generation Primitives
 * 
 * Provides primitives for cryptographic proof generation and verification
 * without direct blockchain publishing. External systems handle proof storage
 * and verification anchoring operations.
 */

var LTPProof = {
  
  /**
   * Prepare signature proof for external verification
   * @param {Object} token - Token to sign
   * @param {PrivateKey} privateKey - Signing private key
   * @param {Object} options - Signing options
   * @returns {Object} Prepared signature proof data
   */
  prepareSignatureProof: function(token, privateKey, options) {
    options = options || {}
    
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
    
    try {
      // Canonicalize token for signing
      var canonical = this._canonicalizeForSigning(token)
      var tokenHash = Hash.sha256(Buffer.from(canonical))
      
      // Create ECDSA signature
      var ecdsa = new ECDSA()
      ecdsa.hashbuf = tokenHash
      ecdsa.privkey = privateKey
      ecdsa.pubkey = privateKey.toPublicKey()
      
      ecdsa.sign()
      var signature = ecdsa.sig
      
      // Create proof object
      var proof = {
        type: 'EcdsaSecp256k1Signature2019',
        created: new Date().toISOString(),
        verificationMethod: 'did:smartledger:' + privateKey.toPublicKey().toString() + '#keys-1',
        proofPurpose: options.purpose || 'assertionMethod',
        jws: this._createJWS(tokenHash, signature),
        proofValue: signature.toDER().toString('hex')
      }
      
      return {
        success: true,
        proof: proof,
        tokenHash: tokenHash.toString('hex'),
        canonical: canonical,
        signingKey: {
          publicKey: privateKey.toPublicKey().toString(),
          keyId: 'did:smartledger:' + privateKey.toPublicKey().toString() + '#keys-1'
        },
        externalOperations: {
          storeProof: {
            endpoint: 'POST /proofs/signature',
            data: {
              tokenHash: tokenHash.toString('hex'),
              proof: proof,
              signingKey: privateKey.toPublicKey().toString()
            }
          },
          verifyProof: {
            endpoint: 'POST /proofs/verify-signature',
            data: {
              tokenHash: tokenHash.toString('hex'),
              signature: signature.toDER().toString('hex'),
              publicKey: privateKey.toPublicKey().toString()
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
   * Prepare signature verification for external processing
   * @param {Object} token - Token with proof
   * @param {String} publicKey - Signer's public key (hex)
   * @returns {Object} Prepared verification data
   */
  prepareSignatureVerification: function(token, publicKey) {
    try {
      $.checkArgument(token && typeof token === 'object', 'Invalid token')
      $.checkArgument(typeof publicKey === 'string', 'Public key must be string')
      
      if (!token.proof) {
        return {
          success: false,
          error: 'No proof found in token'
        }
      }
      
      // Recreate canonical representation
      var canonical = this._canonicalizeForSigning(token)
      var tokenHash = Hash.sha256(Buffer.from(canonical))
      
      // Parse signature from proof
      var signature = Signature.fromDER(Buffer.from(token.proof.proofValue, 'hex'))
      
      // Prepare verification data
      var verificationData = {
        tokenHash: tokenHash.toString('hex'),
        signature: signature.toDER().toString('hex'),
        publicKey: publicKey,
        proof: token.proof,
        canonical: canonical
      }
      
      // Perform local verification for immediate feedback
      var ecdsa = new ECDSA()
      ecdsa.hashbuf = tokenHash
      ecdsa.sig = signature
      ecdsa.pubkey = PublicKey.fromString(publicKey)
      
      var isValid = ecdsa.verify() === true

      return {
        success: true,
        verification: {
          valid: isValid,
          tokenHash: tokenHash.toString('hex'),
          signatureValid: isValid,
          publicKey: publicKey,
          verifiedAt: new Date().toISOString()
        },
        verificationData: verificationData,
        externalOperations: {
          recordVerification: {
            endpoint: 'POST /proofs/verification-record',
            data: {
              tokenHash: tokenHash.toString('hex'),
              result: isValid,
              publicKey: publicKey,
              verifiedAt: new Date().toISOString()
            }
          },
          auditVerification: {
            endpoint: 'POST /audit/proof-verification',
            data: {
              tokenId: token.id,
              proofType: token.proof.type,
              result: isValid,
              verifier: publicKey
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
   * Prepare selective disclosure proof for external processing
   * @param {Object} token - Original token
   * @param {Array} revealedFields - Fields to reveal
   * @param {String} nonce - Proof nonce
   * @returns {Object} Prepared selective disclosure data
   */
  prepareSelectiveDisclosure: function(token, revealedFields, nonce, options) {
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(Array.isArray(revealedFields), 'Revealed fields must be array')
    $.checkArgument(typeof nonce === 'string', 'Nonce must be string')
    var saltSeed = options && options.saltSeed
    if (saltSeed !== undefined && saltSeed !== null) {
      // The seed replaces 32 bytes of CSPRNG output, so a guessable one is not a weaker
      // version of the fix - it is the defect again, with one extra guess in front of it.
      // The 32-character floor is a floor and not a measure of entropy; the seed has to come
      // from a CSPRNG and be kept, which only the caller can do.
      $.checkArgument(typeof saltSeed === 'string' && saltSeed.length >= 32,
        'options.saltSeed must be a string of at least 32 characters, from a CSPRNG')
      // The nonce is published inside the proof. Deriving the salts from it is exactly the
      // pre-9.34.0 defect, so this is refused rather than warned about: the option is new, so
      // no existing caller can be relying on it.
      $.checkArgument(saltSeed !== nonce,
        'options.saltSeed must not be the nonce: the nonce travels inside the proof, so every ' +
        'undisclosed field\u2019s salt would be derivable from the proof alone')
    }
    
    try {
      // Create field commitments
      var fieldCommitments = this._createFieldCommitments(token, nonce, saltSeed)
      
      // Create Merkle tree of field commitments
      var merkleTree = this._createMerkleTree(fieldCommitments)
      
      // Create disclosure for revealed fields
      var disclosures = []
      var merkleProofs = []
      
      revealedFields.forEach(function(fieldPath) {
        var value = this._getNestedValue(token, fieldPath)
        var commitment = this._findFieldCommitment(fieldCommitments, fieldPath)
        
        if (commitment) {
          disclosures.push({
            path: fieldPath,
            value: value,
            commitment: commitment.hash,
            salt: commitment.salt
          })
          
          // Generate Merkle proof for this field
          var merkleProof = this._generateMerkleProof(merkleTree, commitment.index)
          merkleProofs.push({
            path: fieldPath,
            leafIndex: commitment.index,
            proof: merkleProof
          })
        }
      }.bind(this))
      
      var proof = {
        type: 'LegalTokenSelectiveDisclosure',
        created: new Date().toISOString(),
        proofPurpose: 'selectiveDisclosure',
        verificationMethod: token.proof ? token.proof.verificationMethod : null,
        nonce: nonce,
        merkleRoot: merkleTree.root,
        disclosures: disclosures,
        merkleProofs: merkleProofs,
        totalFields: fieldCommitments.length
      }
      
      return {
        success: true,
        proof: proof,
        hiddenFieldCount: fieldCommitments.length - disclosures.length,
        revealedFieldCount: disclosures.length,
        externalOperations: {
          storeDisclosure: {
            endpoint: 'POST /proofs/selective-disclosure',
            data: {
              tokenId: token.id,
              proof: proof,
              merkleRoot: merkleTree.root
            }
          },
          verifyDisclosure: {
            endpoint: 'POST /proofs/verify-disclosure',
            data: {
              proof: proof,
              expectedNonce: nonce
            }
          },
          auditDisclosure: {
            endpoint: 'POST /audit/selective-disclosure',
            data: {
              tokenId: token.id,
              revealedFields: revealedFields,
              totalFields: fieldCommitments.length,
              disclosedAt: new Date().toISOString()
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
   * Prepare selective disclosure verification for external processing
   * @param {Object} proof - Selective disclosure proof
   * @param {String} expectedNonce - Expected nonce
   * @returns {Object} Prepared verification data
   */
  prepareSelectiveDisclosureVerification: function(proof, expectedNonce) {
    try {
      $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')
      $.checkArgument(typeof expectedNonce === 'string', 'Expected nonce must be string')
      
      if (proof.nonce !== expectedNonce) {
        return {
          success: false,
          error: 'Nonce mismatch'
        }
      }
      
      var validDisclosures = []
      var errors = []
      
      // Verify each disclosure
      proof.disclosures.forEach(function(disclosure, index) {
        var merkleProof = proof.merkleProofs[index]
        
        // Verify field commitment. A value outside the permitted domain cannot be committed
        // to unambiguously, so it is THIS field's failure and not an exception that abandons
        // the whole proof — the forged `NaN` above must come back as a verdict of invalid,
        // not as a thrown error a caller might read as "inconclusive".
        var expectedCommitment
        try {
          expectedCommitment = this._hashField(disclosure.path, disclosure.value, disclosure.salt)
        } catch (e) {
          errors.push('Field value is not a permitted type for: ' + disclosure.path)
          return
        }
        if (expectedCommitment !== disclosure.commitment) {
          errors.push('Invalid commitment for field: ' + disclosure.path)
          return
        }
        
        // Verify Merkle proof
        var isValidProof = this._verifyMerkleProof(
          disclosure.commitment,
          merkleProof.leafIndex,
          merkleProof.proof,
          proof.merkleRoot
        )
        
        if (isValidProof) {
          validDisclosures.push({
            path: disclosure.path,
            value: disclosure.value,
            verified: true
          })
        } else {
          errors.push('Invalid Merkle proof for field: ' + disclosure.path)
        }
      }.bind(this))
      
      var verification = {
        valid: errors.length === 0,
        errors: errors,
        disclosures: validDisclosures,
        merkleRoot: proof.merkleRoot,
        totalFields: proof.totalFields,
        verifiedAt: new Date().toISOString()
      }
      
      return {
        success: true,
        verification: verification,
        externalOperations: {
          recordVerification: {
            endpoint: 'POST /proofs/disclosure-verification',
            data: {
              proofId: proof.id || 'unknown',
              result: verification.valid,
              verifiedFields: validDisclosures.length,
              totalFields: proof.totalFields,
              verifiedAt: verification.verifiedAt
            }
          },
          auditVerification: {
            endpoint: 'POST /audit/disclosure-verification',
            data: {
              merkleRoot: proof.merkleRoot,
              disclosuresVerified: validDisclosures.length,
              errors: errors.length,
              result: verification.valid
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
   * Prepare legal validity proof for external compliance checking
   * @param {Object} token - Legal token
   * @param {Object} jurisdiction - Jurisdiction rules
   * @param {String} nonce - Proof nonce
   * @returns {Object} Prepared legal validity data
   */
  prepareLegalValidityProof: function(token, jurisdiction, nonce) {
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(jurisdiction && typeof jurisdiction === 'object', 'Invalid jurisdiction')
    $.checkArgument(typeof nonce === 'string', 'Nonce must be string')
    
    try {
      // Check legal requirements
      var requirements = jurisdiction.requirements || []
      var validityChecks = []
      var isValid = true
      
      requirements.forEach(function(requirement) {
        var check = this._checkLegalRequirement(token, requirement)
        validityChecks.push(check)
        if (!check.satisfied) {
          isValid = false
        }
      }.bind(this))
      
      // Create proof
      var proof = {
        type: 'LegalValidityProof',
        created: new Date().toISOString(),
        proofPurpose: 'legalValidity',
        jurisdiction: jurisdiction.code,
        nonce: nonce,
        valid: isValid,
        checks: validityChecks,
        complianceHash: this._hashCompliance(token, jurisdiction, nonce)
      }
      
      return {
        success: true,
        proof: proof,
        valid: isValid,
        complianceReport: {
          jurisdiction: jurisdiction.code,
          totalRequirements: requirements.length,
          satisfiedRequirements: validityChecks.filter(c => c.satisfied).length,
          failedRequirements: validityChecks.filter(c => !c.satisfied).length,
          overallCompliance: isValid
        },
        externalOperations: {
          submitCompliance: {
            endpoint: 'POST /compliance/legal-validity',
            data: {
              tokenId: token.id,
              jurisdiction: jurisdiction.code,
              proof: proof,
              complianceReport: {
                jurisdiction: jurisdiction.code,
                totalRequirements: requirements.length,
                satisfiedRequirements: validityChecks.filter(c => c.satisfied).length,
                failedRequirements: validityChecks.filter(c => !c.satisfied).length,
                overallCompliance: isValid
              }
            }
          },
          auditCompliance: {
            endpoint: 'POST /audit/compliance-check',
            data: {
              tokenId: token.id,
              jurisdiction: jurisdiction.code,
              result: isValid,
              checkedAt: new Date().toISOString(),
              requirements: validityChecks
            }
          },
          notifyRegulator: isValid ? null : {
            endpoint: 'POST /notifications/compliance-failure',
            data: {
              tokenId: token.id,
              jurisdiction: jurisdiction.code,
              failedRequirements: validityChecks.filter(c => !c.satisfied)
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
   * Prepare zero-knowledge proof for external processing
   * @param {Object} token - Token data
   * @param {Object} statement - Statement to prove
   * @param {String} nonce - Proof nonce
   * @returns {Object} Prepared ZK proof data
   */
  prepareZeroKnowledgeProof: function(token, statement, nonce) {
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(statement && typeof statement === 'object', 'Invalid statement')
    $.checkArgument(typeof nonce === 'string', 'Nonce must be string')
    
    try {
      // Create commitment to token data
      var tokenCommitment = Hash.sha256(Buffer.from(this._canonicalizeForSigning(token) + nonce)).toString('hex')
      
      // Create statement proof (simplified - real ZK would use more sophisticated cryptography)
      var statementProof = {
        type: 'LegalTokenZKProof',
        created: new Date().toISOString(),
        proofPurpose: 'zeroKnowledge',
        statement: {
          claim: statement.claim || 'UNSPECIFIED',
          predicate: statement.predicate || 'SATISFIES',
          threshold: statement.threshold || null
        },
        commitment: tokenCommitment,
        nonce: nonce,
        proofData: this._generateZKProofData(token, statement, nonce)
      }
      
      return {
        success: true,
        proof: statementProof,
        commitment: tokenCommitment,
        externalOperations: {
          storeZKProof: {
            endpoint: 'POST /proofs/zero-knowledge',
            data: {
              tokenId: token.id,
              proof: statementProof,
              statement: statement
            }
          },
          verifyZKProof: {
            endpoint: 'POST /proofs/verify-zk',
            data: {
              proof: statementProof,
              expectedNonce: nonce
            }
          },
          auditZKProof: {
            endpoint: 'POST /audit/zk-proof',
            data: {
              tokenId: token.id,
              statement: statement.claim,
              proofGenerated: new Date().toISOString()
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
   * Generate ZK proof data (simplified implementation)
   * @private
   */
  _generateZKProofData: function(token, statement, nonce) {
    // Simplified ZK proof generation - real implementation would use more sophisticated cryptography
    var proofData = {
      challenge: Hash.sha256(Buffer.from(statement.claim + nonce)).toString('hex'),
      response: Hash.sha256(Buffer.from(this._canonicalizeForSigning(token) + statement.claim)).toString('hex'),
      witness: Hash.sha256(Buffer.from(nonce + token.id + statement.predicate)).toString('hex')
    }
    
    return proofData
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
   * Canonicalize token for signing
   * @private
   */
  _canonicalizeForSigning: function(token) {
    // Remove proof and hash fields
    var signingToken = JSON.parse(JSON.stringify(token))
    delete signingToken.proof
    delete signingToken.tokenHash
    
    // Sort keys recursively
    var canonical = this._sortObjectKeys(signingToken)
    
    return JSON.stringify(canonical)
  },
  
  /**
   * Create field commitments
   * @private
   */
  _createFieldCommitments: function(token, nonce, saltSeed) {
    var commitments = []
    var index = 0
    
    // The salt is the only thing standing between an UNDISCLOSED field and whoever holds
    // the proof, so it must not be derivable from what the proof contains. This derived it
    // from `nonce + path + index`, and the nonce SHIPS INSIDE THE PROOF: the path comes
    // from the schema and the index is a small integer, so every salt in the token -
    // including those of fields never disclosed - could be recomputed by anyone. A disclosed
    // field's Merkle path carries its sibling hashes, and a depth-0 sibling is an
    // undisclosed field's leaf, so a candidate value could be hashed and compared against
    // it. Measured on the published 9.33.2 artifact through the public API: an undisclosed
    // date of birth was recovered from the proof alone inside 100,000 hashes
    // (scripts/published-version-probes/ltp-salt-brute.js).
    //
    // lib/gdaf/zk-prover.js already had this right, and says why: a master salt random by
    // default that NEVER travels in a proof, with per-leaf salts derived from it. This
    // module kept its own copy of the commitment code and so kept the hazard - the same
    // reason it kept the JSON.stringify ambiguity until 9.32.0.
    //
    // The Merkle root therefore MOVES: two disclosures of one token no longer share a root.
    // Every proof already issued still verifies, because a proof carries its own root and
    // its own disclosed salts and verification never re-derives either. What stops working
    // is re-deriving a root from (token, nonce) and comparing - which is the very
    // reproducibility the attack above is built on. A caller that genuinely needs a stable
    // root supplies its own SECRET `saltSeed` and keeps it, and the nonce is refused as a
    // seed because it is public. Pre-9.34.0 roots cannot be reproduced at all: the
    // derivation moved to an HMAC over an injective message at the same time, deliberately,
    // since the only consumer that could have pinned one is outside this library - nothing
    // here signs or anchors this root, and verification never re-derives it.
    var master = saltSeed || Random.getRandomBuffer(32).toString('hex')

    this._traverseObject(token, '', function(path, value) {
      if (path !== 'proof' && path !== 'tokenHash') {
        var salt = LTPProof._deriveSalt(master, path, index)
        var hash = this._hashField(path, value, salt)
        
        commitments.push({
          path: path,
          value: value,
          salt: salt,
          hash: hash,
          index: index
        })
        
        index++
      }
    }.bind(this))
    
    return commitments
  },
  
  /**
   * Derive one field's salt from the master salt.
   *
   * HMAC rather than a bare digest of a concatenation, and the message is encoded so that no
   * two (path, index) pairs can produce the same bytes. The old `nonce + path + index` was
   * ambiguous as well as public: path `a1` at index 2 and path `a` at index 12 both give
   * `...a12`, so two different fields could share a salt. Nothing was exploitable through that
   * on its own - the path is inside the leaf hash too - but the root was moving for the
   * security fix anyway, which is the only cheap moment to stop building on it.
   *
   * The path is length-prefixed, which is what makes the encoding injective.
   * @private
   */
  _deriveSalt: function (master, path, index) {
    var msg = 'ltp-field-salt\u0000' + path.length + '\u0000' + path + '\u0000' + index
    return Hash.sha256hmac(Buffer.from(msg, 'utf8'), Buffer.from(master, 'utf8')).toString('hex')
  },

  /**
   * Hash field with salt
   * @private
   */
  _hashField: function(path, value, salt) {
    // The value is VALIDATED here and the framing is left exactly as it was, which is the
    // whole point of this fix.
    //
    // The defect: this hashed `path + ':' + JSON.stringify(value) + ':' + salt`, and
    // JSON.stringify renders null, NaN and Infinity all as "null". Measured on 9.31.0 through
    // the public LTP.Proof disclosure path: a proof disclosing `null` still VERIFIED after the
    // disclosed value was changed to NaN, and again after it was changed to Infinity. A
    // verified disclosure of a value the issuer never committed to.
    //
    // The obvious fix is the length-prefixed encoding lib/gdaf/zk-prover.js adopted, but that
    // would move EVERY commitment and so every Merkle root this module has ever produced, and
    // STABILITY.md promises 9.x will not break callers before 2027-09-01 — with one exception,
    // for APIs that can lose funds, which this is not. A forgeable credential commitment is
    // serious, but the published promise is not mine to reinterpret.
    //
    // So: refuse the values that are not injectively encodable, and keep the bytes. The three
    // forgeable values are exactly the ones a validated domain rejects, and `canonicalMember`
    // returns RFC 8785 which is byte-identical to JSON.stringify for every value that can
    // reach a leaf here — `_traverseObject` recurses into objects AND arrays, so a leaf value
    // is always a primitive, and the two agree on all 29 primitives tested, differing only on
    // multi-key object key order, which cannot occur. Verified against the 9.31.0 code: no
    // commitment and no Merkle root changes.
    //
    // What is NOT fixed: `':'` can still occur inside a path or a salt, so the component
    // boundaries are not provably unambiguous. No collision was found within the validated
    // domain — JSON's quoting delimits the value — but "none found" is not "none exists". The
    // length-prefixed encoding is the real answer and is recorded as a 10.0.0 change.
    var data = path + ':' + FieldCommit.canonicalMember(value, path) + ':' + salt
    return Hash.sha256(Buffer.from(data)).toString('hex')
  },
  
  /**
   * Create Merkle tree from commitments
   * @private
   */
  _createMerkleTree: function(commitments) {
    var leaves = commitments.map(function(c) { return c.hash })
    
    if (leaves.length === 0) {
      return { root: null, levels: [] }
    }
    
    var levels = [leaves]
    var currentLevel = leaves
    
    while (currentLevel.length > 1) {
      var nextLevel = []
      
      for (var i = 0; i < currentLevel.length; i += 2) {
        var left = currentLevel[i]
        var right = currentLevel[i + 1] || left
        
        var combined = Buffer.concat([
          Buffer.from(left, 'hex'),
          Buffer.from(right, 'hex')
        ])
        
        var hash = Hash.sha256(combined).toString('hex')
        nextLevel.push(hash)
      }
      
      levels.push(nextLevel)
      currentLevel = nextLevel
    }
    
    return {
      root: currentLevel[0],
      levels: levels
    }
  },
  
  /**
   * Generate Merkle proof for leaf
   * @private
   */
  _generateMerkleProof: function(tree, leafIndex) {
    var proof = []
    var index = leafIndex
    
    for (var level = 0; level < tree.levels.length - 1; level++) {
      var currentLevel = tree.levels[level]
      var isLeft = index % 2 === 0
      var siblingIndex = isLeft ? index + 1 : index - 1
      
      if (siblingIndex < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIndex],
          isLeft: !isLeft
        })
      } else {
        // No sibling is not no step: _createMerkleTree pairs a last odd node with ITSELF
        // (`currentLevel[i + 1] || left`), so omitting this left the verifier skipping a
        // level the builder hashed and the HONEST holder's disclosure failed. Measured
        // through prepareSelectiveDisclosure: 3 fields broke the 3rd, 5 broke the 5th, 6
        // broke the 5th AND 6th, 9 broke the 9th; only a power-of-two field count worked.
        // Same defect and same fix as lib/gdaf/zk-prover.js, which carries its own copy of
        // this Merkle code — the duplication is why one bug had two homes.
        proof.push({
          hash: currentLevel[index],
          isLeft: false
        })
      }
      
      index = Math.floor(index / 2)
    }
    
    return proof
  },
  
  /**
   * Verify Merkle proof
   * @private
   */
  _verifyMerkleProof: function(leaf, leafIndex, proof, expectedRoot) {
    var currentHash = leaf
    var currentIndex = leafIndex
    
    for (var i = 0; i < proof.length; i++) {
      var step = proof[i]
      var isLeft = currentIndex % 2 === 0
      
      var combined
      if (step.isLeft) {
        combined = Buffer.concat([
          Buffer.from(step.hash, 'hex'),
          Buffer.from(currentHash, 'hex')
        ])
      } else {
        combined = Buffer.concat([
          Buffer.from(currentHash, 'hex'),
          Buffer.from(step.hash, 'hex')
        ])
      }
      
      currentHash = Hash.sha256(combined).toString('hex')
      currentIndex = Math.floor(currentIndex / 2)
    }
    
    return currentHash === expectedRoot
  },
  
  /**
   * Traverse object and call callback for each field
   * @private
   */
  _traverseObject: function(obj, basePath, callback) {
    if (Array.isArray(obj)) {
      obj.forEach(function(item, index) {
        var path = basePath + '[' + index + ']'
        this._traverseObject(item, path, callback)
      }.bind(this))
    } else if (obj !== null && typeof obj === 'object') {
      Object.keys(obj).forEach(function(key) {
        // `.` separates path segments and `[n]` indexes arrays, so a key containing any of
        // them is ambiguous: nested `{ a: { b: x } }` and flat `{ 'a.b': x }` flatten to the
        // same path. Here it is doubly wrong, because `_getNestedValue` reads the path back
        // with `path.split('.')` — for a literal `'a.b'` key that lookup returns undefined,
        // so the commitment and the value it claims to cover come apart.
        //
        // Marked rather than refused, for the reason given at length in
        // lib/gdaf/zk-prover.js _extractFields: STABILITY.md allows a break inside a 9.x
        // minor only for an API that can lose funds, and this is not one. Escaping the
        // separators moves every Merkle root, so it waits for 10.0.0.
        if (/[.[\]]/.test(key)) {
          deprecate({
            what: 'an LTP token field name containing "." "[" or "]" (path syntax)',
            since: '9.32.0',
            removeIn: '10.0.0',
            plan: 'ltp-token-path-syntax-field-name',
            why: 'the path cannot be read back with split("."), so the commitment and the ' +
              'value it names come apart, and two different tokens can share one Merkle root',
            use: 'field names without "." "[" or "]"'
          })
        }
        var path = basePath ? basePath + '.' + key : key
        this._traverseObject(obj[key], path, callback)
      }.bind(this))
    } else {
      callback(basePath, obj)
    }
  },
  
  /**
   * Get nested value from object
   * @private
   */
  _getNestedValue: function(obj, path) {
    return path.split('.').reduce(function(current, prop) {
      return current && current[prop]
    }, obj)
  },
  
  /**
   * Find field commitment by path
   * @private
   */
  _findFieldCommitment: function(commitments, path) {
    return commitments.find(function(c) { return c.path === path })
  },
  
  /**
   * Check legal requirement
   * @private
   */
  _checkLegalRequirement: function(token, requirement) {
    // Simplified legal requirement checking
    // In practice, this would be much more sophisticated
    
    switch (requirement.type) {
      case 'field_present':
        var value = this._getNestedValue(token, requirement.field)
        return {
          requirement: requirement.type,
          field: requirement.field,
          satisfied: value !== undefined && value !== null
        }
      
      case 'field_value':
        var value = this._getNestedValue(token, requirement.field)
        return {
          requirement: requirement.type,
          field: requirement.field,
          satisfied: value === requirement.expectedValue
        }
      
      case 'temporal_validity':
        var now = new Date()
        var issuanceDate = new Date(token.issuanceDate)
        return {
          requirement: requirement.type,
          satisfied: issuanceDate <= now
        }
      
      default:
        return {
          requirement: requirement.type,
          satisfied: false,
          error: 'Unknown requirement type'
        }
    }
  },
  
  /**
   * Hash compliance information
   * @private
   */
  _hashCompliance: function(token, jurisdiction, nonce) {
    var complianceData = {
      tokenId: token.id,
      jurisdiction: jurisdiction.code,
      nonce: nonce,
      timestamp: new Date().toISOString()
    }
    
    return Hash.sha256(Buffer.from(JSON.stringify(complianceData))).toString('hex')
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
  }
}

module.exports = LTPProof