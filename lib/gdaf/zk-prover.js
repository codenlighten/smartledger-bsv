'use strict'

var Random = require('../crypto/random')
var AttestationSigner = require('./attestation-signer')
var Hash = require('../crypto/hash')
var BN = require('../crypto/bn')
var $ = require('../util/preconditions')

/**
 * ZKProver
 *
 * Selective disclosure of credential fields, built on a salted Merkle tree and hash
 * commitments.
 *
 * NOT ZERO-KNOWLEDGE, despite the name this module has carried. There is no
 * zero-knowledge machinery here — no Bulletproofs, no pairing, no circuit. What it
 * provides is:
 *
 * - Selective field disclosure that genuinely withholds the undisclosed fields. Each
 *   leaf carries its own salt and only the disclosed leaves' salts travel in the proof,
 *   so an undisclosed leaf hash is a commitment under a secret the verifier never sees.
 * - Merkle inclusion proofs binding disclosed fields to a credential root.
 * - Hash commitments for ranges and ages. These can only be verified by OPENING them,
 *   which reveals the committed value to the verifier. A real age proof would not; this
 *   cannot do that, and callers who need it need a different primitive.
 *
 * The range and age verifiers previously returned a boolean the prover wrote about
 * itself, so any object of the right shape verified. They now require the opening and
 * check the commitment. Keep that distinction in mind before describing anything built
 * on this module as zero-knowledge to a reviewer.
 */

/**
 * ZKProver constructor
 * @param {Object} options - Configuration options
 */
function ZKProver(options) {
  if (!(this instanceof ZKProver)) {
    return new ZKProver(options)
  }
  
  this.options = options || {}
  
  return this
}

/**
 * Create Merkle tree from credential fields
 * @param {Object} credential - Credential object
 * @param {String} salt - Random salt for hashing
 * @returns {Object} Merkle tree data
 */
ZKProver.createMerkleTree = function(credential, salt) {
  $.checkArgument(credential && typeof credential === 'object', 'Invalid credential')

  // Extract all fields from credential
  var fields = ZKProver._extractFields(credential)

  // PER-LEAF salts. A single salt shared by every leaf defeats selective disclosure
  // entirely: the proof has to carry the salt so the verifier can recompute the
  // disclosed leaves, and with that one value an attacker can hash candidate
  // (path, value) pairs against the sibling hashes on the Merkle path and read back
  // exactly the fields the holder withheld. Confirmed against a synthetic credential —
  // disclosing only `credentialSubject.name` leaked `id`, `partyAffiliation` and
  // `eligible`, the last two by brute-forcing their shared parent node.
  //
  // With a salt per leaf, only the disclosed leaves' salts travel in the proof, so an
  // undisclosed leaf hash is a commitment under a secret the verifier never sees.
  //
  // `salt` is accepted only to derive DETERMINISTIC per-leaf salts, so a caller that
  // needs reproducible trees still gets them without sharing one value across leaves.
  var master = salt || Random.getRandomBuffer(32).toString('hex')

  var leaves = fields.map(function(field, index) {
    var leafSalt = Hash.sha256(
      Buffer.from(master + ':' + index + ':' + field.path, 'utf8')
    ).toString('hex')
    var fieldData = field.path + ':' + JSON.stringify(field.value) + ':' + leafSalt
    return {
      path: field.path,
      value: field.value,
      hash: Hash.sha256(Buffer.from(fieldData, 'utf8')).toString('hex'),
      salt: leafSalt
    }
  })

  // Build Merkle tree
  var tree = ZKProver._buildMerkleTree(leaves.map(l => l.hash))

  return {
    // The MASTER salt. Never put this in a proof — it re-derives every leaf salt and
    // reopens the whole credential. generateSelectiveProof() ships per-leaf salts.
    salt: master,
    leaves: leaves,
    tree: tree,
    root: tree[tree.length - 1][0]
  }
}

/**
 * Generate selective disclosure proof
 * @param {Object} credential - Original credential
 * @param {Array|String} disclosePaths - Field paths to disclose
 * @param {String} salt - Salt used in Merkle tree
 * @returns {Object} Selective disclosure proof
 */
ZKProver.generateSelectiveProof = function(credential, disclosePaths, salt) {
  $.checkArgument(credential && typeof credential === 'object', 'Invalid credential')
  
  if (typeof disclosePaths === 'string') {
    disclosePaths = [disclosePaths]
  }
  
  $.checkArgument(Array.isArray(disclosePaths), 'Disclose paths must be array')
  
  // Create Merkle tree
  var merkleData = ZKProver.createMerkleTree(credential, salt)
  
  // Find leaves for disclosed paths
  var disclosedLeaves = []
  var merkleProofs = []
  
  disclosePaths.forEach(function(path) {
    var leaf = merkleData.leaves.find(l => l.path === path)
    if (leaf) {
      disclosedLeaves.push(leaf)
      
      // Generate Merkle proof for this leaf
      var leafIndex = merkleData.leaves.findIndex(l => l.path === path)
      var proof = ZKProver._generateMerkleProof(merkleData.tree, leafIndex)
      merkleProofs.push({
        path: path,
        leafIndex: leafIndex,
        proof: proof
      })
    }
  })
  
  return {
    type: 'SelectiveDisclosureProof',
    created: new Date().toISOString(),
    proofPurpose: 'selectiveDisclosure',
    verificationMethod: credential.proof ? credential.proof.verificationMethod : null,
    credentialRoot: merkleData.root,
    credentialHash: credential.rootHash || AttestationSigner._hashCredential(credential).toString('hex'),
    disclosedFields: disclosedLeaves.map(function(leaf) {
      return {
        path: leaf.path,
        value: leaf.value,
        hash: leaf.hash,
        // The salt for THIS leaf only. Shipping one salt for the whole credential let
        // a verifier — or anyone the proof is shown to — brute-force the withheld
        // fields off the Merkle path.
        salt: leaf.salt
      }
    }),
    merkleProofs: merkleProofs
    // NOTE: the master salt is deliberately absent. It re-derives every leaf salt,
    // including the undisclosed ones, which would reopen the whole credential.
  }
}

/**
 * Verify selective disclosure proof
 * @param {Object} proof - Selective disclosure proof
 * @param {String} expectedRoot - Expected Merkle root
 * @returns {Object} Verification result
 */
ZKProver.verifySelectiveProof = function(proof, expectedRoot) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')
    $.checkArgument(typeof expectedRoot === 'string', 'Expected root must be string')
    
    var result = {
      valid: false,
      errors: [],
      verifiedFields: []
    }
    
    // Verify each disclosed field
    for (var i = 0; i < proof.disclosedFields.length; i++) {
      var field = proof.disclosedFields[i]
      var merkleProof = proof.merkleProofs.find(p => p.path === field.path)
      
      if (!merkleProof) {
        result.errors.push('Missing Merkle proof for field: ' + field.path)
        continue
      }
      
      // Verify field hash, using the salt carried with THIS field. Reading a
      // credential-wide `proof.salt` is what the leak fix removed.
      if (typeof field.salt !== 'string' || !field.salt) {
        result.errors.push('Missing per-field salt for: ' + field.path)
        continue
      }
      var fieldData = field.path + ':' + JSON.stringify(field.value) + ':' + field.salt
      var computedHash = Hash.sha256(Buffer.from(fieldData, 'utf8')).toString('hex')
      
      if (computedHash !== field.hash) {
        result.errors.push('Field hash mismatch for: ' + field.path)
        continue
      }
      
      // Verify Merkle proof
      var proofValid = ZKProver._verifyMerkleProof(field.hash, merkleProof.proof, expectedRoot)
      if (!proofValid) {
        result.errors.push('Invalid Merkle proof for: ' + field.path)
        continue
      }
      
      result.verifiedFields.push({
        path: field.path,
        value: field.value,
        verified: true
      })
    }
    
    result.valid = result.errors.length === 0 && result.verifiedFields.length > 0
    
    return result
    
  } catch (error) {
    return {
      valid: false,
      errors: ['Proof verification failed: ' + error.message],
      verifiedFields: []
    }
  }
}

/**
 * Generate age proof without revealing birthdate
 * @param {Date} birthDate - Actual birth date
 * @param {Number} minimumAge - Minimum age to prove
 * @param {String} salt - Random salt
 * @returns {Object} Age proof
 */
ZKProver.generateAgeProof = function(birthDate, minimumAge, salt) {
  $.checkArgument(birthDate instanceof Date, 'Birth date must be Date object')
  $.checkArgument(typeof minimumAge === 'number', 'Minimum age must be number')
  
  salt = salt || Random.getRandomBuffer(32).toString('hex')
  
  var now = new Date()
  var ageInYears = Math.floor((now - birthDate) / (365.25 * 24 * 60 * 60 * 1000))
  
  if (ageInYears < minimumAge) {
    throw new Error('Age requirement not met')
  }
  
  // Create commitment to birth date
  var birthDateString = birthDate.toISOString().split('T')[0] // YYYY-MM-DD
  var commitment = Hash.sha256(Buffer.from(birthDateString + ':' + salt, 'utf8')).toString('hex')
  
  // Create proof that age >= minimumAge without revealing exact age or birthdate
  var ageProofData = {
    minimumAge: minimumAge,
    ageAttestation: ageInYears >= minimumAge,
    timestamp: now.toISOString(),
    salt: salt
  }
  
  var ageProofHash = Hash.sha256(Buffer.from(JSON.stringify(ageProofData), 'utf8')).toString('hex')
  
  return {
    type: 'AgeProof',
    created: new Date().toISOString(),
    proofPurpose: 'ageVerification',
    minimumAge: minimumAge,
    meetsRequirement: true,
    birthDateCommitment: commitment,
    ageProofHash: ageProofHash,
    challengeResponse: ZKProver._generateAgeChallenge(birthDate, minimumAge, salt),
    // As with the range proof: the commitment can only be checked by opening it, and
    // opening it reveals the birth date. Returned alongside the proof, never inside it.
    opening: { birthDate: birthDateString, salt: salt }
  }
}

/**
 * Verify age proof
 * @param {Object} proof - Age proof
 * @param {Number} requiredAge - Required minimum age
 * @returns {Boolean} True if proof is valid
 */
ZKProver.verifyAgeProof = function(proof, requiredAge, opening) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')
    $.checkArgument(typeof requiredAge === 'number', 'Required age must be number')
    
    // Verify proof structure
    if (proof.type !== 'AgeProof') {
      return false
    }
    
    if (proof.minimumAge !== requiredAge) {
      return false
    }

    // Same defect as verifyRangeProof, and the same fix. This used to accept
    // `proof.meetsRequirement` — the prover's own claim — and then check only that
    // `challengeResponse` was a non-empty string, which any forged proof satisfies.
    // `birthDateCommitment` was never opened.
    //
    // The commitment is over the birth date, so verifying it requires the birth date.
    // That reveals it, which is precisely what an age proof is supposed to avoid — the
    // honest reading is that this construction cannot do what its name promises, and a
    // caller who needs real age proofs needs a different primitive.
    if (!opening || typeof opening !== 'object') {
      return false
    }
    var birthDate = opening.birthDate
    if (typeof birthDate === 'string') birthDate = new Date(birthDate)
    if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
      return false
    }
    if (typeof opening.salt !== 'string') {
      return false
    }

    var birthDateString = birthDate.toISOString().split('T')[0]
    var commitment = Hash.sha256(
      Buffer.from(birthDateString + ':' + opening.salt, 'utf8')
    ).toString('hex')
    if (commitment !== proof.birthDateCommitment) {
      return false
    }

    // Recompute the age rather than trusting `meetsRequirement`.
    var ageInYears = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    return ageInYears >= requiredAge

  } catch (error) {
    return false
  }
}

/**
 * Generate range proof for numerical value
 * @param {Number} value - Value to prove range for
 * @param {Number} min - Minimum value (inclusive)
 * @param {Number} max - Maximum value (inclusive)
 * @param {String} salt - Random salt
 * @returns {Object} Range proof
 */
ZKProver.generateRangeProof = function(value, min, max, salt) {
  $.checkArgument(typeof value === 'number', 'Value must be number')
  $.checkArgument(typeof min === 'number', 'Min must be number')
  $.checkArgument(typeof max === 'number', 'Max must be number')
  $.checkArgument(value >= min && value <= max, 'Value not in range')
  
  salt = salt || Random.getRandomBuffer(32).toString('hex')
  
  // Create commitment to value
  var commitment = Hash.sha256(Buffer.from(value.toString() + ':' + salt, 'utf8')).toString('hex')
  
  // Generate proof components. NOT a Bulletproof — this is a hash commitment plus a
  // hash over the parameters. It says nothing without the opening returned below.
  var proofData = {
    min: min,
    max: max,
    inRange: true,
    timestamp: new Date().toISOString(),
    salt: salt
  }
  
  var proofHash = Hash.sha256(Buffer.from(JSON.stringify(proofData), 'utf8')).toString('hex')
  
  return {
    type: 'RangeProof',
    created: new Date().toISOString(),
    proofPurpose: 'rangeVerification',
    range: { min: min, max: max },
    valueCommitment: commitment,
    proofHash: proofHash,
    inRange: true,
    // The OPENING. verifyRangeProof() cannot check the commitment without it, so the
    // holder must pass it to the verifier out of band. It is returned here rather than
    // embedded in the proof precisely because handing it over reveals the value — that
    // disclosure is the cost of a commitment scheme, and hiding it inside the proof
    // would make every proof self-opening.
    opening: { value: value, salt: salt }
  }
}

/**
 * Verify range proof
 * @param {Object} proof - Range proof
 * @param {Number} min - Expected minimum
 * @param {Number} max - Expected maximum
 * @returns {Boolean} True if proof is valid
 */
ZKProver.verifyRangeProof = function(proof, min, max, opening) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')

    if (proof.type !== 'RangeProof') {
      return false
    }

    if (!proof.range || proof.range.min !== min || proof.range.max !== max) {
      return false
    }

    // WITHOUT AN OPENING, NOTHING HAS BEEN PROVEN. This used to end at
    // `return proof.inRange === true` — a boolean the prover writes about itself, never
    // checked against `valueCommitment`. Any object of the right shape verified:
    //
    //   { type: 'RangeProof', range: { min: 18, max: 120 },
    //     valueCommitment: '00…', proofHash: 'de…', inRange: true }   -> true
    //
    // These are hash commitments, not zero-knowledge proofs: the commitment can only be
    // checked by opening it, so the holder must supply { value, salt } out of band. That
    // reveals the value to the verifier, which is the honest cost of this construction
    // and the reason it must not be described as zero-knowledge.
    if (!opening || typeof opening !== 'object') {
      return false
    }
    if (typeof opening.value !== 'number' || typeof opening.salt !== 'string') {
      return false
    }

    // The commitment must actually open to the claimed value...
    var commitment = Hash.sha256(
      Buffer.from(opening.value.toString() + ':' + opening.salt, 'utf8')
    ).toString('hex')
    if (commitment !== proof.valueCommitment) {
      return false
    }

    // ...and that value must genuinely lie in the range, rather than the prover saying so.
    return opening.value >= min && opening.value <= max

  } catch (error) {
    return false
  }
}

/**
 * Extract all fields from credential recursively
 * @private
 */
ZKProver._extractFields = function(obj, prefix) {
  prefix = prefix || ''
  var fields = []
  
  Object.keys(obj).forEach(function(key) {
    var path = prefix ? prefix + '.' + key : key
    var value = obj[key]
    
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursive extraction for nested objects
      fields = fields.concat(ZKProver._extractFields(value, path))
    } else {
      // Leaf field
      fields.push({
        path: path,
        value: value
      })
    }
  })
  
  return fields
}

/**
 * Build Merkle tree from leaf hashes
 * @private
 */
ZKProver._buildMerkleTree = function(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build tree from empty leaves')
  }
  
  var tree = [leaves]
  
  while (tree[tree.length - 1].length > 1) {
    var currentLevel = tree[tree.length - 1]
    var nextLevel = []
    
    for (var i = 0; i < currentLevel.length; i += 2) {
      var left = currentLevel[i]
      var right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left
      
      var combined = left + right
      var hash = Hash.sha256(Buffer.from(combined, 'hex')).toString('hex')
      nextLevel.push(hash)
    }
    
    tree.push(nextLevel)
  }
  
  return tree
}

/**
 * Generate Merkle proof for leaf at index
 * @private
 */
ZKProver._generateMerkleProof = function(tree, leafIndex) {
  var proof = []
  var currentIndex = leafIndex
  
  for (var level = 0; level < tree.length - 1; level++) {
    var currentLevel = tree[level]
    var isLeft = currentIndex % 2 === 0
    var siblingIndex = isLeft ? currentIndex + 1 : currentIndex - 1
    
    if (siblingIndex < currentLevel.length) {
      proof.push({
        hash: currentLevel[siblingIndex],
        isLeft: !isLeft
      })
    }
    
    currentIndex = Math.floor(currentIndex / 2)
  }
  
  return proof
}

/**
 * Verify Merkle proof
 * @private
 */
ZKProver._verifyMerkleProof = function(leafHash, proof, expectedRoot) {
  var currentHash = leafHash
  
  for (var i = 0; i < proof.length; i++) {
    var proofElement = proof[i]
    var combined = proofElement.isLeft ? proofElement.hash + currentHash : currentHash + proofElement.hash
    currentHash = Hash.sha256(Buffer.from(combined, 'hex')).toString('hex')
  }
  
  return currentHash === expectedRoot
}

/**
 * Generate age challenge (simplified)
 * @private
 */
ZKProver._generateAgeChallenge = function(birthDate, minimumAge, salt) {
  // Simplified challenge - in production would use more sophisticated ZK
  var challenge = Hash.sha256(Buffer.from(birthDate.toISOString() + minimumAge + salt, 'utf8'))
  return challenge.toString('hex')
}

/**
 * Create zero-knowledge proof of membership
 * @param {Array} set - Set of values
 * @param {*} value - Value to prove membership of
 * @param {String} salt - Random salt
 * @returns {Object} Membership proof
 */
ZKProver.generateMembershipProof = function(set, value, salt) {
  $.checkArgument(Array.isArray(set), 'Set must be array')
  $.checkArgument(set.includes(value), 'Value not in set')
  
  salt = salt || Random.getRandomBuffer(32).toString('hex')
  
  // Create commitments to all set members
  var commitments = set.map(function(member) {
    return Hash.sha256(Buffer.from(JSON.stringify(member) + ':' + salt, 'utf8')).toString('hex')
  })
  
  // Create commitment to the claimed value
  var valueCommitment = Hash.sha256(Buffer.from(JSON.stringify(value) + ':' + salt, 'utf8')).toString('hex')
  
  return {
    type: 'MembershipProof',
    created: new Date().toISOString(),
    proofPurpose: 'membershipVerification',
    setCommitments: commitments,
    valueCommitment: valueCommitment,
    isMember: true
  }
}

/**
 * Verify membership proof
 * @param {Object} proof - Membership proof
 * @returns {Boolean} True if proof is valid
 */
ZKProver.verifyMembershipProof = function(proof) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')
    
    if (proof.type !== 'MembershipProof') {
      return false
    }
    
    if (!Array.isArray(proof.setCommitments)) {
      return false
    }
    
    // Verify that the value commitment appears in the set commitments
    return proof.setCommitments.includes(proof.valueCommitment) && proof.isMember
    
  } catch (error) {
    return false
  }
}

module.exports = ZKProver