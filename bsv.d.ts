// Type definitions for @smartledger/bsv 3.4.x
// Project: https://github.com/codenlighten/smartledger-bsv
// Forked from: https://github.com/moneybutton/bsv (which forked from https://github.com/bitpay/bitcore-lib)
// Original definitions by: Lautaro Dragan <https://github.com/lautarodragan>
// Extended by: David Case <https://github.com/shruggr>
// SmartLedger v3.3-3.4.x additions: DIDWeb, VcJwt, StatusList, Anchor, GDAF, LTP, SmartContract, SmartVerify, EllipticFixed, Shamir
//
// Promise<T> is used for async methods, so TS 2.2+ with --lib es2015 (or later) is required.

/// <reference types="node" />

declare module '@smartledger/bsv' {

    export namespace crypto {
        class BN { }

        namespace ECDSA {
            function sign(message: Buffer, key: PrivateKey): Signature;
            function verify(hashbuf: Buffer, sig: Signature, pubkey: PublicKey, endian?: 'little'): boolean;
        }

        namespace Hash {
            function sha1(buffer: Buffer): Buffer;
            function sha256(buffer: Buffer): Buffer;
            function sha256sha256(buffer: Buffer): Buffer;
            function sha256ripemd160(buffer: Buffer): Buffer;
            function sha512(buffer: Buffer): Buffer;
            function ripemd160(buffer: Buffer): Buffer;

            function sha256hmac(data: Buffer, key: Buffer): Buffer;
            function sha512hmac(data: Buffer, key: Buffer): Buffer;
        }

        namespace Random {
            function getRandomBuffer(size: number): Buffer;
        }

        namespace Point { }

        class Signature {
            static fromDER(sig: Buffer): Signature;
            static fromString(data: string): Signature;
            SIGHASH_ALL: number;
            toString(): string;
        }
    }

    export namespace Transaction {
        class UnspentOutput {
            static fromObject(o: object): UnspentOutput;

            readonly address: Address;
            readonly txId: string;
            readonly outputIndex: number;
            readonly script: Script;
            readonly satoshis: number;
            spentTxId: string | null;

            constructor(data: object);

            inspect(): string;
            toObject(): this;
            toString(): string;
        }

        class Output {
            readonly script: Script;
            readonly satoshis: number;
            readonly satoshisBN: crypto.BN;
            spentTxId: string | null;
            constructor(data: object);

            setScript(script: Script | string | Buffer): this;
            inspect(): string;
            toObject(): object;
        }

        class Input {
            readonly prevTxId: Buffer;
            readonly outputIndex: number;
            readonly sequenceNumber: number;
            readonly script: Script;
            output?: Output;
            isValidSignature(tx: Transaction, sig: any): boolean;
        }
    }

    export class Transaction {
        inputs: Transaction.Input[];
        outputs: Transaction.Output[];
        readonly id: string;
        readonly hash: string;
        readonly inputAmount: number;
        readonly outputAmount: number;
        nid: string;

        constructor(serialized?: any);

        from(utxos: Transaction.UnspentOutput | Transaction.UnspentOutput[]): this;
        to(address: Address[] | Address | string, amount: number): this;
        change(address: Address | string): this;
        fee(amount: number): this;
        feePerKb(amount: number): this;
        sign(privateKey: PrivateKey | string): this;
        applySignature(sig: crypto.Signature): this;
        addInput(input: Transaction.Input): this;
        addOutput(output: Transaction.Output): this;
        addData(value: Buffer | string): this;
        lockUntilDate(time: Date | number): this;
        lockUntilBlockHeight(height: number): this;

        hasWitnesses(): boolean;
        getFee(): number;
        getChangeOutput(): Transaction.Output | null;
        getLockTime(): Date | number;

        verify(): string | boolean;
        isCoinbase(): boolean;

        enableRBF(): this;
        isRBF(): boolean;

        inspect(): string;
        serialize(): string;

        toObject(): any;
        toBuffer(): Buffer;

        verify(): boolean | string;
        isFullySigned(): boolean;
    }

    export class ECIES {
        constructor(opts?: any, algorithm?: string);
        
        privateKey(privateKey: PrivateKey): ECIES;
        publicKey(publicKey: PublicKey): ECIES;
        encrypt(message: string | Buffer): Buffer;
        decrypt(encbuf: Buffer): Buffer;
    }
    export class Block {
        hash: string;
        height: number;
        transactions: Transaction[];
        header: {
            time: number;
            prevHash: string;
        };

        constructor(data: Buffer | object);
    }

    export class PrivateKey {
        constructor(key?: string, network?: Networks.Network);
        
        readonly publicKey: PublicKey;
        readonly compressed: boolean;
        readonly network: Networks.Network;
        
        toAddress(): Address;
        toPublicKey(): PublicKey;
        toString(): string;
        toObject(): object;
        toJSON(): object;
        toWIF(): string;
        toHex(): string;
        toBigNumber(): any; //BN;
        toBuffer(): Buffer;
        inspect(): string;

        static fromString(str: string): PrivateKey;
        static fromWIF(str: string): PrivateKey;
        static fromRandom(netowrk?: string): PrivateKey;
        static fromBuffer(buf: Buffer, network: string | Networks.Network): PrivateKey;
        static fromHex(hex: string, network: string | Networks.Network): PrivateKey;
        static getValidationError(data: string): any | null;
        static isValid(data: string): boolean;
    }

    export class PublicKey {
        constructor(source: string, extra?: object);
        
        //readonly point: Point;
        readonly compressed: boolean;
        readonly network: Networks.Network;

        toDER(): Buffer;
        toObject(): object;
        toBuffer(): Buffer;
        toAddress(network?: string | Networks.Network): Address;
        toString(): string;
        toHex(): string;
        inspect(): string;

        static fromPrivateKey(privateKey: PrivateKey): PublicKey;
        static fromBuffer(buf: Buffer, strict: boolean): PublicKey;
        static fromDER(buf: Buffer, strict: boolean): PublicKey;
        //static fromPoint(point: Point, compressed: boolean): PublicKey;
        //static fromX(odd: boolean, x: Point): PublicKey;
        static fromString(str: string): PublicKey;
        static fromHex(hex: string): PublicKey;
        static getValidationError(data: string): any | null;
        static isValid(data: string): boolean;
    }

    export class Message {
        constructor(message: string | Buffer);

        readonly messageBuffer: Buffer;

        sign(privateKey: PrivateKey): string;
        verify(address: string | Address, signature: string): boolean;
        toObject(): object;
        toJSON(): string;
        toString(): string;
        inspect(): string;

        static sign(message: string | Buffer, privateKey: PrivateKey): string;
        static verify(message: string | Buffer, address: string | Address, signature: string): boolean;
        static MAGIC_BYTES: Buffer;
        static magicHash(): string;
        static fromString(str: string): Message;
        static fromJSON(json: string): Message;
        static fromObject(obj: object): Message;
    }

    export class Mnemonic {
        constructor(data: string | Array<string>, wordList?: Array<string>);

        readonly wordList: Array<string>;
        readonly phrase: string;

        toSeed(passphrase?: string): Buffer;
        toHDPrivateKey(passphrase: string, network: string | number): HDPrivateKey;
        toString(): string;
        inspect(): string;

        static fromRandom(wordlist?: Array<string>): Mnemonic;
        static fromString(mnemonic: String, wordList?: Array<string>): Mnemonic;
        static isValid(mnemonic: String, wordList?: Array<string>): boolean;
        static fromSeed(seed: Buffer, wordlist: Array<string>): Mnemonic
    }

    export class HDPrivateKey {
        constructor(data?: string | Buffer | object);

        readonly hdPublicKey: HDPublicKey;
        
        readonly xprivkey: Buffer;
        readonly xpubkey: Buffer;
        readonly network: Networks.Network;
        readonly depth: number;
        readonly privateKey: PrivateKey;
        readonly publicKey: PublicKey;
        readonly fingerPrint: Buffer;

        derive(arg: string | number, hardened?: boolean): HDPrivateKey;
        deriveChild(arg: string | number, hardened?: boolean): HDPrivateKey;
        deriveNonCompliantChild(arg: string | number, hardened?: boolean): HDPrivateKey;

        toString(): string;
        toObject(): object;
        toJSON(): object;
        toBuffer(): Buffer;
        toHex(): string;
        inspect(): string;

        static fromRandom(): HDPrivateKey;
        static fromString(str: string): HDPrivateKey;
        static fromObject(obj: object): HDPrivateKey;
        static fromSeed(hexa: string | Buffer, network: string | Networks.Network): HDPrivateKey;
        static fromBuffer(buf: Buffer): HDPrivateKey;
        static fromHex(hex: string): HDPrivateKey;
        static isValidPath(arg: string | number, hardened: boolean): boolean;
        static isValidSerialized(data: string | Buffer, network?: string | Networks.Network): boolean;
        static getSerializedError(data: string | Buffer, network?: string | Networks.Network): any | null;
    }

    export class HDPublicKey {
        constructor(arg: string | Buffer | object);

        readonly xpubkey: Buffer;
        readonly network: Networks.Network;
        readonly depth: number;
        readonly publicKey: PublicKey;
        readonly fingerPrint: Buffer;

        derive(arg: string | number, hardened?: boolean): HDPublicKey;
        deriveChild(arg: string | number, hardened?: boolean): HDPublicKey;

        toString(): string;
        toObject(): object;
        toJSON(): object;
        toBuffer(): Buffer;
        toHex(): string;
        inspect(): string;

        static fromString(str: string): HDPublicKey;
        static fromObject(obj: object): HDPublicKey;
        static fromBuffer(buf: Buffer): HDPublicKey;
        static fromHex(hex:  string): HDPublicKey;

        static fromHDPrivateKey(hdPrivateKey: HDPrivateKey): HDPublicKey;
        static isValidPath(arg: string | number): boolean;
        static isValidSerialized(data: string | Buffer, network?: string | Networks.Network): boolean;
        static getSerializedError(data: string | Buffer, network?: string | Networks.Network): any | null;

    }

    export namespace Script {
        const types: {
            DATA_OUT: string;
        };
        function buildMultisigOut(publicKeys: PublicKey[], threshold: number, opts: object): Script;
        function buildWitnessMultisigOutFromScript(script: Script): Script;
        function buildMultisigIn(pubkeys: PublicKey[], threshold: number, signatures: Buffer[], opts: object): Script;
        function buildP2SHMultisigIn(pubkeys: PublicKey[], threshold: number, signatures: Buffer[], opts: object): Script;
        function buildPublicKeyHashOut(address: Address): Script;
        function buildPublicKeyOut(pubkey: PublicKey): Script;
        function buildDataOut(data: string | Buffer, encoding?: string): Script;
        function buildScriptHashOut(script: Script): Script;
        function buildPublicKeyIn(signature: crypto.Signature | Buffer, sigtype: number): Script;
        function buildPublicKeyHashIn(publicKey: PublicKey, signature: crypto.Signature | Buffer, sigtype: number): Script;

        function fromAddress(address: string | Address): Script;

        function empty(): Script;
        namespace Interpreter {
            const SCRIPT_ENABLE_SIGHASH_FORKID: any;
        }

        function Interpreter(): {
            verify: (
                inputScript: Script, 
                outputScript: Script, 
                txn: Transaction,
                nin: Number,
                flags: any,
                satoshisBN: crypto.BN
            ) => boolean
        }
    }

    export class Script {
        constructor(data: string | object);

        set(obj: object): this;

        toBuffer(): Buffer;
        toASM(): string;
        toString(): string;
        toHex(): string;

        isPublicKeyHashOut(): boolean;
        isPublicKeyHashIn(): boolean;

        getPublicKey(): Buffer;
        getPublicKeyHash(): Buffer;

        isPublicKeyOut(): boolean;
        isPublicKeyIn(): boolean;

        isScriptHashOut(): boolean;
        isWitnessScriptHashOut(): boolean;
        isWitnessPublicKeyHashOut(): boolean;
        isWitnessProgram(): boolean;
        isScriptHashIn(): boolean;
        isMultisigOut(): boolean;
        isMultisigIn(): boolean;
        isDataOut(): boolean;
        isSafeDataOut(): boolean;

        getData(): Buffer;
        isPushOnly(): boolean;

        classify(): string;
        classifyInput(): string;
        classifyOutput(): string;

        isStandard(): boolean;

        prepend(obj: any): this;
        add(obj: any): this;

        hasCodeseparators(): boolean;
        removeCodeseparators(): this;

        equals(script: Script): boolean;

        getAddressInfo(): Address | boolean;
        findAndDelete(script: Script): this;
        checkMinimalPush(i: number): boolean;
        getSignatureOperationsCount(accurate: boolean): number;

        toAddress(network?: string): Address;
    }

    export interface Util {
        readonly buffer: {
            reverse(a: any): any;
        };
    }

    export namespace Networks {
        interface Network {
            readonly name: string;
            readonly alias: string;
        }

        const livenet: Network;
        const mainnet: Network;
        const testnet: Network;

        function add(data: any): Network;
        function remove(network: Network): void;
        function get(args: string | number | Network, keys: string | string[]): Network;
    }

    export class Address {
        readonly hashBuffer: Buffer;
        readonly network: Networks.Network;
        readonly type: string;

        constructor(data: Buffer | Uint8Array | string | object, network?: Networks.Network | string, type?: string);
    }

    export class Unit {
        static fromBTC(amount: number): Unit;
        static fromMilis(amount: number): Unit;
        static fromBits(amount: number): Unit;
        static fromSatoshis(amount: number): Unit;

        constructor(amount: number, unitPreference: string);

        toBTC(): number;
        toMilis(): number;
        toBits(): number;
        toSatoshis(): number;
    }

    // ---------------------------------------------------------------------
    // SmartLedger v3.3-3.4.x additions
    //
    // The W3C / legal-token / smart-contract APIs accept and return
    // structured JSON documents whose schemas are intentionally open. We
    // type them loosely (`any` / `object` / named JWK interfaces) so the
    // shapes can evolve without breaking consumer builds. Where the runtime
    // uniformly returns `{success, error?, ...}` result envelopes, those
    // are typed precisely.
    // ---------------------------------------------------------------------

    export const version: string;
    export const isHardened: boolean;
    export const hardenedBy: string;
    export const baseVersion: string;
    export const securityFeatures: string[];

    // -------- crypto.SmartVerify / crypto.EllipticFixed / crypto.Shamir --

    export namespace crypto {
        namespace SmartVerify {
            function smartVerify(msgHash: Buffer, sig: Signature | Buffer, pubkey: PublicKey | Buffer): boolean;
            function isCanonical(sig: Signature | Buffer): boolean;
            function canonicalize(sig: Signature | Buffer): { r: any; s: any };
            const constants: { n: any; nh: any };
        }
        namespace EllipticFixed {
            const ec: {
                verify(msg: Buffer | string, sig: any, key: any, enc?: string, opts?: object): boolean;
                sign(msg: Buffer | string, key: any, enc?: string, options?: object): any;
            };
        }
        class Shamir {
            static split(secret: Buffer | string, threshold: number, shares: number, options?: object): ShamirShare[];
            static combine(shares: ShamirShare[]): Buffer;
            static verifyShare(share: ShamirShare): boolean;
            static generateTestVectors(): {
                secret: string;
                threshold: number;
                totalShares: number;
                shares: ShamirShare[];
                reconstructed: string;
                valid: boolean;
            };
        }
    }

    export const SmartVerify: typeof crypto.SmartVerify;
    export const EllipticFixed: typeof crypto.EllipticFixed;
    export const Shamir: typeof crypto.Shamir;

    export interface ShamirShare {
        id: number;
        threshold: number;
        shares: number;
        length: number;
        bytes: string | Buffer;
    }

    export namespace SmartLedger {
        const version: string;
        const hardenedBy: string;
        const baseVersion: string;
        const securityFeatures: string[];
        const SmartVerify: typeof crypto.SmartVerify;
        const EllipticFixed: typeof crypto.EllipticFixed;
    }

    // -------- DIDWeb -----------------------------------------------------

    export interface Jwk {
        kty: string;
        crv?: string;
        x?: string;
        y?: string;
        d?: string;
        [key: string]: any;
    }

    export interface IssuerKeyset {
        privateJwk: Jwk;
        publicJwk: Jwk;
        kid: string;
        alg: 'ES256' | 'ES256K';
    }

    export interface DidWebDocuments {
        did: string;
        didDocument: object;
        jwks: { keys: Jwk[] };
    }

    export namespace DIDWeb {
        function generateIssuerKeys(opts?: { alg?: 'ES256' | 'ES256K'; kid?: string }): Promise<IssuerKeyset>;
        function buildDidWebDocuments(params: {
            domain: string;
            p256?: { jwk: Jwk; kid?: string };
            k1?: { jwk: Jwk; kid?: string };
            controllerName?: string;
        }): DidWebDocuments;
        function rotateIssuerKey(params: {
            domain: string;
            newKey: { jwk: Jwk; kid?: string; alg?: 'ES256' | 'ES256K' };
            keepOldForDays?: number;
        }): DidWebDocuments;
    }

    // -------- VcJwt -----------------------------------------------------

    export interface VcJwtIssueResult {
        jwt: string;
    }

    export interface VcJwtVerifyResult {
        valid: boolean;
        header?: object;
        payload?: object;
        error?: string;
    }

    export type DidResolver = (did: string) => Promise<{ jwks?: { keys: Jwk[] }; didDocument?: object }>;

    export namespace VcJwt {
        function issueVcJwt(params: {
            issuerDid: string;
            subjectId: string;
            credentialSubject: object;
            privateJwk: Jwk;
            alg?: 'ES256' | 'ES256K';
            kid?: string;
            types?: string[];
            expSeconds?: number;
        }): Promise<VcJwtIssueResult>;
        function verifyVcJwt(jwt: string, opts?: {
            expectedIssuerDid?: string;
            didResolver?: DidResolver;
            clockToleranceSec?: number;
        }): Promise<VcJwtVerifyResult>;
        function base64UrlEncode(buffer: Buffer): string;
        function base64UrlDecode(str: string): Buffer;
    }

    // -------- StatusList2021 --------------------------------------------

    export type CredentialStatus = 'valid' | 'revoked' | 'suspended' | string;

    export namespace StatusList {
        function createStatusList(params: {
            issuerDid: string;
            privateJwk: Jwk;
            listId?: string;
            listSize?: number;
        }): Promise<{ listVcJwt: string; listId: string }>;
        function updateStatusList(params: {
            listVcJwt: string;
            index: number;
            status: CredentialStatus;
            privateJwk: Jwk;
        }): Promise<{ listVcJwt: string }>;
        function getCredentialStatusEntry(params: { listVcJwt: string; index: number }): CredentialStatus;
    }

    // -------- Anchor (top-level hash anchoring) -------------------------

    export type AnchorKind = 'VC_ANCHOR_SHA256' | 'STATUSLIST_SHA256' | 'PRESENTATION_SHA256' | string;

    export interface AnchorPayload {
        json: object;
    }

    export interface AnchorParseResult {
        valid: boolean;
        protocol?: string;
        version?: string;
        type?: AnchorKind;
        hash?: string;
        issuer?: string;
        timestamp?: string;
        error?: string;
    }

    export namespace Anchor {
        function sha256Hex(data: string | Buffer | Uint8Array): string;
        function buildAnchorPayload(params: {
            kind: AnchorKind;
            hash: string;
            issuerDid: string;
            issuedAt?: string;
        }): AnchorPayload;
        function verifyAnchorHash(originalData: string | Buffer, anchorHash: string): boolean;
        function parseAnchorPayload(opReturnData: string): AnchorParseResult;
    }

    // -------- GDAF (Global Digital Attestation Framework) ---------------

    export class GDAF {
        constructor(options?: {
            attestationSigner?: object;
            anchor?: object;
        });

        // DID
        createDID(publicKey: PublicKey): string;
        resolveDID(did: string): object;
        verifyDIDOwnership(did: string, privateKey: PrivateKey): boolean;

        // Credentials
        createEmailCredential(issuerDID: string, subjectDID: string, email: string, issuerPrivateKey: PrivateKey): object;
        createAgeCredential(issuerDID: string, subjectDID: string, ageThreshold: number, birthDate: Date | string, issuerPrivateKey: PrivateKey): object;
        createKYCCredential(issuerDID: string, subjectDID: string, level: string, piiHashes: object, issuerPrivateKey: PrivateKey): object;
        createOrganizationCredential(issuerDID: string, subjectDID: string, orgData: object, issuerPrivateKey: PrivateKey): object;
        createPresentation(credentials: object[], holderDID: string, holderPrivateKey: PrivateKey, options?: object): object;
        signCredential(credential: object, privateKey: PrivateKey): object;

        // Verification
        verifyCredential(credential: object, options?: object): { valid: boolean; [key: string]: any };
        verifyPresentation(presentation: object, options?: object): { valid: boolean; [key: string]: any };
        extractClaims(credentials: object[]): object;

        // Zero-knowledge
        generateSelectiveProof(credential: object, revealedFields: string[], nonce: string): object;
        verifySelectiveProof(proof: object, publicData: object): boolean;
        generateAgeProof(ageCredential: object, minimumAge: number, nonce: string): object;
        verifyAgeProof(proof: object, minimumAge: number, issuerDID: string): boolean;
        generateRangeProof(value: number, min: number, max: number, nonce: string): object;
        verifyRangeProof(proof: object, min: number, max: number): boolean;
        generateMembershipProof(value: string, validSet: string[], nonce: string): object;
        verifyMembershipProof(proof: object, validSet: string[]): boolean;

        // Anchoring
        anchorCredential(credential: object, privateKey: PrivateKey, options?: object): object;
        anchorBatch(credentials: object[], privateKey: PrivateKey, options?: object): object;
        registerDID(did: string, didDocument: object, privateKey: PrivateKey, options?: object): object;
        revokeCredential(credentialId: string, reason: string, privateKey: PrivateKey, options?: object): object;
        queryAnchoredData(hash: string): object;

        // Schemas
        validateCredential(credential: object, schema: string | object): { valid: boolean; errors?: string[] };
        getSchema(credentialType: string): object;
        getAllSchemas(): { [name: string]: object };
        addSchema(name: string, definition: object): void;
        createTemplate(credentialType: string): object;

        // Utilities
        generateNonce(length?: number): string;
        hashData(data: string, salt?: string): string;
        getVersion(): string;
        getInfo(): object;
    }

    // -------- LTP (Legal Token Protocol) --------------------------------

    export interface LtpResult<T = object> {
        success: boolean;
        token?: T;
        error?: string;
        [key: string]: any;
    }

    export class LTP {
        constructor(config?: { registry?: object });

        registry: object | null;

        createRightToken(rightData: object, privateKey: PrivateKey, options?: object): LtpResult;
        validateClaim(claimData: object, schemaType: string): { valid: boolean; errors?: string[] };
        createSelectiveDisclosure(token: object, revealedFields: string[], nonce: string): object;
        verifyToken(token: object, publicKey: string | PublicKey): { valid: boolean; error?: string };
        transferRight(token: object, newOwner: string, ownerKey: PrivateKey, options?: object): LtpResult;
        createObligation(rightToken: object, obligationData: object, privateKey: PrivateKey): LtpResult;
        revokeToken(tokenId: string, revocationData: object, authority: string): { success: boolean; error?: string };
        checkTokenStatus(tokenId: string): { found: boolean; error?: string; [key: string]: any };
        searchTokens(criteria: object): { success: boolean; results?: object[]; error?: string };
        getRegistryStats(): object;
        createLegalValidityProof(token: object, jurisdiction: object, nonce: string): object;
        anchorTokenBatch(tokens: object[], options?: object): object;
        verifyAnchor(token: object, txid: string): { valid: boolean; error?: string };
        getRightTypes(): object;
        getClaimSchemas(): object;
        createRegistry(config: object): object;
        setRegistry(registry: object): void;

        // Static API surface
        static create(config?: object): LTP;
        static createRightToken(rightData: object, privateKey: PrivateKey, options?: object): LtpResult;
        static validateClaim(claimData: object, schemaType: string): { valid: boolean; errors?: string[] };
        static verifyToken(token: object, publicKey: string | PublicKey): { valid: boolean; error?: string };
        static createRegistry(config: object): object;

        // Component sub-namespaces (each is the corresponding lib/ltp/*.js module)
        static Right: any;
        static Claim: any;
        static Anchor: any;
        static Proof: any;
        static Registry: any;
        static Obligation: any;
    }

    // -------- SmartContract framework (covenants, BIP-143, JS-to-Script) -

    // The SmartContract framework spans 12+ classes and a JS-to-Bitcoin-Script
    // DSL. Each class accepts/produces rich domain objects whose shapes are
    // documented in lib/smart_contract/. We declare the surface broadly so
    // users get autocomplete on the public entry points without committing
    // to evolving internal shapes.

    export namespace SmartContract {
        class Covenant {
            constructor(privateKey: PrivateKey, options?: object);
            [key: string]: any;
        }
        class Preimage {
            constructor(preimageHex: string, options?: object);
            [key: string]: any;
        }
        class SIGHASH {
            constructor(sighashType: number);
            [key: string]: any;
        }
        class Builder {
            constructor(privateKey: PrivateKey, options?: object);
            [key: string]: any;
        }
        class UTXOGenerator {
            constructor(options?: object);
            createRealUTXOs(count: number, satoshis: number): Transaction.UnspentOutput[];
            [key: string]: any;
        }
        class ScriptTester {
            constructor(options?: object);
            [key: string]: any;
        }
        class CovenantBuilder {
            constructor();
            extractField(field: string): CovenantBuilder;
            push(value: any): CovenantBuilder;
            greaterThanOrEqual(): CovenantBuilder;
            build(): any;
            [key: string]: any;
        }
        class StackExaminer {
            constructor(options?: object);
            [key: string]: any;
        }
        class ScriptInterpreter {
            constructor(options?: object);
            [key: string]: any;
        }
        const CovenantTemplates: { [name: string]: any };
        const OpcodeMap: { [opcode: string]: any };
        const ScriptUtils: { [name: string]: any };

        function createCovenant(privateKey: PrivateKey, options?: object): Covenant;
        function extractPreimage(preimageHex: string, options?: object): Preimage;
        function analyzeSIGHASH(sighashType: number): SIGHASH;
        function buildCovenant(privateKey: PrivateKey, options?: object): Builder;
        function testScript(unlocking: any, locking: any, options?: object): any;
        function testCovenant(preimageHex: string, constraints: object, options?: object): any;
        function debugScript(config: object, options?: object): any;
        function createCovenantBuilder(): CovenantBuilder;
        function scriptToASM(scriptBuffer: Buffer): string;
        function asmToScript(asmString: string): Buffer;
        function asmToHex(asm: string): string;
        function hexToASM(hex: string): string;
        function validateASM(asmString: string): boolean;
        function interpretScript(script: Script | Buffer | string): any;
        function optimizeScript(script: Script | Buffer | string): any;
    }

    // -------- BrowserUTXOManager ----------------------------------------

    export class BrowserUTXOManager {
        constructor(options?: {
            storage?: Storage;
            storageKey?: string;
            autoSave?: boolean;
            maxUTXOs?: number;
        });

        loadFromStorage(): void;
        saveToStorage(): void;
        getStorage(): Storage | null;
        [key: string]: any;
    }

    // -------- Top-level convenience methods -----------------------------
    //
    // These are shortcut methods on the main `bsv` export that delegate to
    // a freshly constructed GDAF / LTP instance. They mirror the methods
    // above; param/return types are kept loose because they cover the
    // same JSON shapes as the underlying class methods.

    // GDAF wrappers (index.js:185-249)
    export function createDID(publicKey: PublicKey): string;
    export function resolveDID(did: string): object;
    export function createEmailCredential(issuerDID: string, subjectDID: string, email: string, issuerPrivateKey: PrivateKey): object;
    export function createAgeCredential(issuerDID: string, subjectDID: string, ageThreshold: number, birthDate: Date | string, issuerPrivateKey: PrivateKey): object;
    export function createKYCCredential(issuerDID: string, subjectDID: string, level: string, piiHashes: object, issuerPrivateKey: PrivateKey): object;
    export function verifyCredential(credential: object, options?: object): { valid: boolean; [key: string]: any };
    export function validateCredential(credential: object, schema: string | object): { valid: boolean; errors?: string[] };
    export function generateSelectiveProof(credential: object, revealedFields: string[], nonce: string): object;
    export function generateAgeProof(ageCredential: object, minimumAge: number, nonce: string): object;
    export function verifyAgeProof(proof: object, minimumAge: number, issuerDID: string): boolean;
    export function createPresentation(credentials: object[], holderDID: string, holderPrivateKey: PrivateKey, options?: object): object;
    export function getCredentialSchemas(): { [name: string]: object };
    export function createCredentialTemplate(credentialType: string): object;

    // LTP Right primitives
    export function prepareRightToken(type: string, issuerDID: string, subjectDID: string, claim: object, issuerPrivateKey: PrivateKey, options?: object): object;
    export function prepareRightTokenVerification(token: object, options?: object): object;
    export function prepareRightTokenTransfer(token: object, newOwnerDID: string, currentOwnerKey: PrivateKey, options?: object): object;
    export function prepareRightTypeValidation(type: string): object;

    // LTP Obligation primitives
    export function prepareObligationToken(type: string, issuerDID: string, obligorDID: string, obligation: object, issuerPrivateKey: PrivateKey, options?: object): object;
    export function prepareObligationVerification(token: object, options?: object): object;
    export function prepareObligationFulfillment(token: object, fulfillment: object, obligorKey: PrivateKey, options?: object): object;
    export function prepareObligationBreachAssessment(token: object, breach: object, assessor: string): object;
    export function prepareObligationMonitoringReport(obligations: object[], criteria: object): object;

    // LTP Claim primitives
    export function prepareClaimValidation(claim: object, schemaName: string): object;
    export function prepareClaimAttestation(claim: object, schemaName: string, attestor: string): object;
    export function prepareClaimDispute(claimHash: string, disputant: string, dispute: object): object;
    export function prepareBulkClaimValidation(claims: object[], schemaName: string): object;
    export function prepareClaimTemplate(schemaName: string, options?: object): object;

    // LTP Proof primitives
    export function prepareSignatureProof(token: object, privateKey: PrivateKey, options?: object): object;
    export function prepareSignatureVerification(token: object, publicKey: string | PublicKey): object;
    export function prepareSelectiveDisclosure(token: object, revealedFields: string[], nonce: string): object;
    export function prepareSelectiveDisclosureVerification(proof: object, expectedNonce: string): object;
    export function prepareLegalValidityProof(token: object, jurisdiction: object, nonce: string): object;
    export function prepareZeroKnowledgeProof(token: object, statement: object, nonce: string): object;

    // LTP Registry primitives
    export function prepareRegistry(config: object): object;
    export function prepareTokenRegistration(token: object, registryConfig: object, options?: object): object;
    export function prepareTokenApproval(tokenId: string, approver: string, registryConfig: object): object;
    export function prepareTokenRevocation(tokenId: string, revocation: object, registryConfig: object): object;
    export function prepareTokenStatusQuery(tokenId: string, registryConfig: object): object;
    export function prepareTokenSearch(criteria: object, registryConfig: object): object;
    export function prepareStatisticsQuery(registryConfig: object): object;
    export function prepareAuditLogQuery(registryConfig: object, options?: object): object;

    // LTP Anchor primitives
    export function prepareTokenCommitment(token: object, options?: object): object;
    export function prepareBatchCommitment(tokens: object[], options?: object): object;
    export function verifyTokenAnchor(token: object, txid: string, txData?: object): object;
    export function formatRevocation(tokenId: string, revocationData: object): object;

    // Legacy LTP compatibility wrappers
    export function createRightToken(rightData: object, privateKey: PrivateKey, options?: object): LtpResult;
    export function verifyLegalToken(token: object, publicKey: string | PublicKey): { valid: boolean; error?: string };
    export function validateLegalClaim(claimData: object, schemaType: string): { valid: boolean; errors?: string[] };
    export function createSelectiveDisclosure(token: object, revealedFields: string[], nonce: string): object;
    export function createLegalRegistry(config: object): object;
    export function createLegalValidityProof(token: object, jurisdiction: object, nonce: string): object;

    // LTP static data accessors
    export function getRightTypes(): object;
    export function getObligationTypes(): object;
    export function getObligationPriority(): object;
    export function getObligationStatus(): object;
    export function getClaimSchemas(): object;
    export function getClaimSchemaNames(): string[];
    export function getClaimSchema(schemaName: string): object;
    export function createClaimTemplate(schemaName: string): object;
    export function canonicalizeClaim(claim: object): object;
    export function hashClaim(claim: object): string;
    export function addCustomClaimSchema(name: string, schema: object): void;

    // Shamir convenience wrappers (also available on bsv.Shamir directly)
    export function splitSecret(secret: Buffer | string, totalShares: number, threshold: number, options?: object): ShamirShare[];
    export function reconstructSecret(shares: ShamirShare[]): Buffer;
    export function validateShare(share: ShamirShare): boolean;
}