'use strict'

var Random = require('../crypto/random')
var AttestationSigner = require('./attestation-signer')
var Hash = require('../crypto/hash')
var BN = require('../crypto/bn')
var $ = require('../util/preconditions')
var JCS = require('../util/jcs')

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
/**
 * The canonical bytes a set member or claimed value commits to.
 *
 * `JSON.stringify` is NOT injective, and the commitment inherited every collision. All of
 * `null`, `NaN`, `Infinity` and `-Infinity` render as `"null"`, so a prover could claim `NaN`
 * was a member of `[null]` and the recomputed commitments matched — a forgery that survived
 * the 9.20.0 fix, found by red-teaming it rather than by a test. `{a:1,b:undefined}` renders
 * identically to `{a:1}`, and key order made two spellings of the same object commit
 * differently, so a legitimate caller could also be refused.
 *
 * So: a restricted value domain, validated recursively, encoded with RFC 8785 canonical JSON.
 * JCS sorts keys (two spellings of one object now agree) and refuses non-finite numbers and
 * `undefined` outright. The recursive check adds what JCS alone does not catch — an
 * `undefined` PROPERTY VALUE, which JCS drops exactly as JSON does.
 *
 * Allowed: null, boolean, finite number, string, array, plain object of those.
 */
function canonicalMember (value, path) {
  var where = path || 'value'
  var t = typeof value
  if (value === null || t === 'boolean' || t === 'string') {
    // fine
  } else if (t === 'number') {
    if (!isFinite(value)) throw new Error(where + ' must be a finite number')
  } else if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      if (value[i] === undefined) throw new Error(where + '[' + i + '] is undefined')
      canonicalMember(value[i], where + '[' + i + ']')
    }
  } else if (t === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) {
      throw new Error(where + ' must be a plain object')
    }
    var keys = Object.keys(value)
    for (var k = 0; k < keys.length; k++) {
      if (value[keys[k]] === undefined) {
        throw new Error(where + '.' + keys[k] + ' is undefined')
      }
      canonicalMember(value[keys[k]], where + '.' + keys[k])
    }
  } else {
    throw new Error(where + ' is not a permitted type: ' + t)
  }
  return JCS.stringify(value)
}

ZKProver.generateMembershipProof = function(set, value, salt) {
  $.checkArgument(Array.isArray(set), 'Set must be array')

  // Membership is structural, over the canonical form. `set.includes(value)` compared objects
  // by reference, so generating a proof for a structurally equal object threw "Value not in
  // set" — a caller could not use this with object members at all.
  var canonicalSet = set.map(function (member, i) {
    return canonicalMember(member, 'set[' + i + ']')
  })
  var canonicalValue = canonicalMember(value)
  $.checkArgument(canonicalSet.indexOf(canonicalValue) !== -1, 'Value not in set')

  salt = salt || Random.getRandomBuffer(32).toString('hex')

  var commitments = canonicalSet.map(function (form) {
    return Hash.sha256(Buffer.from(form + ':' + salt, 'utf8')).toString('hex')
  })

  var valueCommitment = Hash.sha256(Buffer.from(canonicalValue + ':' + salt, 'utf8')).toString('hex')
  
  return {
    type: 'MembershipProof',
    created: new Date().toISOString(),
    proofPurpose: 'membershipVerification',
    setCommitments: commitments,
    valueCommitment: valueCommitment,
    isMember: true,
    // The salt is returned so the holder can build the opening the verifier now requires.
    // It is NOT secret from the verifier: one salt covers every member, so a verifier given
    // the salt and the set can recompute every commitment — which is exactly what
    // verification does. See the note on verifyMembershipProof.
    salt: salt
  }
}

/**
 * Verify membership proof.
 *
 * The same defect as verifyAgeProof and verifyRangeProof had, and the same fix. This used
 * to take the proof alone and return
 *
 *     proof.setCommitments.includes(proof.valueCommitment) && proof.isMember
 *
 * where EVERY value in that expression came from the prover. Nothing bound the commitments
 * to a set the verifier knew, nothing opened the value commitment, and `isMember` was the
 * prover's own claim. So this returned true:
 *
 *     verifyMembershipProof({ type: 'MembershipProof',
 *                             setCommitments: ['x'], valueCommitment: 'x', isMember: true })
 *
 * A forged proof needed no key, no salt and no set. Reported against 9.19.0 by a consumer
 * who had reviewed the GDAF proofs in July and re-tested them.
 *
 * The verifier must now supply the set it believes in, and the holder must supply an
 * opening. Both commitments are recomputed and membership is decided against the VERIFIER's
 * set, not the prover's array.
 *
 * This is not zero-knowledge and cannot be, consistent with the header note on this module.
 * One salt covers every member, so a verifier holding the set and the salt can recompute
 * every commitment — the set is not hidden from the verifier, and a low-entropy set is not
 * hidden from anyone who sees the proof. The honest claim is "this value is in a set the
 * verifier already holds", which is a membership CHECK, not a privacy-preserving proof. A
 * caller who needs the value or the set hidden needs a different primitive; a reference
 * construction is per-attribute fresh salts under an issuer-signed RFC 6962 root.
 *
 * @param {Object} proof - Membership proof from generateMembershipProof
 * @param {Object} opening - { value, salt } as returned alongside the proof
 * @param {Array} set - the set the VERIFIER believes in, supplied by the verifier
 * @returns {Boolean} True if the opening commits to a member of the verifier's set
 */
ZKProver.verifyMembershipProof = function(proof, opening, set) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof')

    if (proof.type !== 'MembershipProof') {
      return false
    }

    if (!Array.isArray(proof.setCommitments)) {
      return false
    }

    // Without a verifier-supplied set and an opening there is nothing to check the prover's
    // array against, so there is no honest answer but false.
    if (!Array.isArray(set) || set.length === 0) {
      return false
    }
    if (!opening || typeof opening !== 'object' || typeof opening.salt !== 'string') {
      return false
    }
    if (!('value' in opening)) {
      return false
    }

    // Canonical, injective encoding over a validated domain — see canonicalMember. Anything
    // outside the domain throws, and the catch below answers false, which is the honest
    // verdict for a value this construction cannot commit to unambiguously.
    var commit = function (member, path) {
      return Hash.sha256(
        Buffer.from(canonicalMember(member, path) + ':' + opening.salt, 'utf8')
      ).toString('hex')
    }

    // The prover's array must be exactly the commitments the verifier's set implies, in
    // order. Comparing as a set would let a prover append a commitment of its own.
    var expected = set.map(function (m, i) { return commit(m, 'set[' + i + ']') })
    if (expected.length !== proof.setCommitments.length) {
      return false
    }
    for (var i = 0; i < expected.length; i++) {
      if (expected[i] !== proof.setCommitments[i]) {
        return false
      }
    }

    // The opening must commit to the value the proof names.
    if (commit(opening.value, 'opening.value') !== proof.valueCommitment) {
      return false
    }

    // Decided against the verifier's set, and `proof.isMember` is not consulted.
    return expected.indexOf(proof.valueCommitment) !== -1
    
  } catch (error) {
    return false
  }
}

module.exports = ZKProver