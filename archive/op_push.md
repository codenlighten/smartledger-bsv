One common misconception regarding Bitcoin script is that its access is only limited to the data provided in the locking script and corresponding unlocking script. Thus, its scope and capability are extremely limited. We devise an algorithm to get the current transaction that contains the script being evaluated. We call it OP_PUSH_TX since it works as a pseudo opcode that pushes the current transaction into the stack. We implement it in sCrypt, a high-level language that compiles to native script, and demonstrate its usage through an example.
OP_CHECKSIG

OP_CHECKSIG is an opcode that verifies an ECDSA signature. Conceptually, it consists of two steps:

    Calculate a hash from the current transaction.
    Verify signature against the hash.

Note that the hash in step 1 can only be the hash of the current transaction and thus OP_CHECKSIG only works if the data signed is the current transaction. It cannot work for any other signed data.
OP_PUSH_TX
Overview

Normally, the signature used in OP_CHECKSIG is generated off chain and is part of the unlocking script. To get the current transaction, we instead calculate the signature on chain within script. To do that, the current transaction, instead of the signature, is included in the unlocking script. A dummy ECDSA key pair is in the locking script. From the transaction and the private key, an ECDSA signature can be computed, which is checked against the public key using OP_CHECKSIG as usual. If the check passes, we are sure the transaction is the current one, since OP_CHECKSIG only passes when the data signed is the current transaction.
Details

The OP_PUSH_TX algorithm is implemented using script as follows:

    1. Push the current transaction

    2. Push a dummy private key

    3. Generate a signature using the transaction and the private key pushed in step 1 and 2, using ECDSA signing algorithm in script

    4. Push the public key derived from the private key pushed in step 2

    5. OP_CHECKSIG

Step 1 is done in the unlocking script, all other steps are in the locking script.
Get sCrypt’s stories in your inbox

Join Medium for free to get updates from this writer.

If OP_CHECKSIG in step 5 succeeds, we can be sure the transaction pushed in step 1 is the current transaction because OP_CHECKSIG only succeeds if the signature is for the current transaction¹, regardless of how the signature is generated.

It is noteworthy that a private key, which is usually kept secret, is exposed here in script in step 2. This is not a problem since it is solely used to validate the transaction is current, not to prove ownership of bitcoins. In fact, it can even be reused.
Sighash Preimage

To be more precise, what is pushed in step 1 is not the current transaction itself, but a preimage derived from it, which is then hashed twice using SHA256. The format of the preimage is specified as follows:
Press enter or click to view image in full size
Sighash Preimage Format

Note that input script is not included.
Implementation

sCrypt implements the OP_PUSH_TX algorithm and packages it in a standard contract called Tx. As an example, we use it to develop a contract called CheckLockTimeVerify, which ensures coins are time locked and cannot be spent before matureTime is reached, similar to OP_CLTV. With only two lines of code (Line 5 and 7), you can get the current transaction.
Contract OP_CLTV
Implications

OP_PUSH_TX allows inspection of the entire transaction inside a contract itself, including all inputs and outputs.We can place arbitrary constraints on them in a contract. This opens up boundless possibilities for all kinds of smart contracts on Bitcoin, which we will demonstrate.

This article is the first of a series of articles on what Bitcoin smart contracts can do and how to implement them.