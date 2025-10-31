# 🚀 SmartLedger-BSV Demo Collection

This directory contains interactive demonstrations of the SmartLedger-BSV smart contract framework capabilities.

## 📋 Available Demos

### 1. 🌐 **HTML Interactive Demo** (`smart_contract_demo.html`)
**Web-based interactive demonstration with visual interface**

- **Purpose:** Browser-based exploration of smart contract features
- **Interface:** Modern web UI with tabs, buttons, and real-time output
- **Best for:** Visual learners, presentations, and quick exploration

**Features:**
- 📚 **Basics Tab** - Library loading and feature overview
- 🔒 **Covenant Builder** - Interactive covenant creation with multiple types
- 🧾 **Preimage Parser** - BIP-143 transaction field extraction
- 💎 **UTXO Generator** - Mock UTXO creation and management
- 🛠️ **Script Tools** - Bitcoin Script building and analysis

**Usage:**
```bash
# Serve locally (requires http-server or similar)
npx http-server demos/
# Then open http://localhost:8080/smart_contract_demo.html

# Or open directly in browser
open demos/smart_contract_demo.html
```

---

### 2. 💻 **Node.js CLI Demo** (`smart_contract_demo.js`)
**Command-line interactive demonstration for developers**

- **Purpose:** Terminal-based smart contract development workflow
- **Interface:** Interactive CLI with colored output and structured commands
- **Best for:** Developers, automation, CI/CD integration

**Features:**
- 🎯 **Interactive Mode** - Full CLI experience with command history
- ⚡ **Direct Commands** - Run specific features without interaction
- 🎨 **Colored Output** - Enhanced readability with chalk (optional)
- 📊 **Structured Logging** - Timestamped output with status indicators
- 🔧 **Developer-Friendly** - Perfect for scripting and automation

**Usage:**

```bash
# Interactive mode
node demos/smart_contract_demo.js

# Show help
node demos/smart_contract_demo.js --help

# Run specific features
node demos/smart_contract_demo.js --feature basics
node demos/smart_contract_demo.js --feature covenant
node demos/smart_contract_demo.js --feature preimage
node demos/smart_contract_demo.js --feature utxo
node demos/smart_contract_demo.js --feature scripts
```

**Interactive Commands:**
```
smartledger-bsv> basics                    # Load library and run tests
smartledger-bsv> covenant generate simple  # Generate simple covenant
smartledger-bsv> covenant test             # Test current covenant  
smartledger-bsv> preimage sample           # Generate sample transaction
smartledger-bsv> utxo generate 50000       # Generate 50k sat UTXO
smartledger-bsv> scripts build             # Build sample script
smartledger-bsv> examples                  # Show real-world use cases
smartledger-bsv> help                      # Show all commands
smartledger-bsv> exit                      # Exit demo
```

---

## 🎯 **Feature Comparison**

| Feature | HTML Demo | Node.js Demo |
|---------|-----------|--------------|
| **Interface** | Visual web UI | Command-line interface |
| **Interactivity** | Click-based | Type-based commands |
| **Real-time Output** | Browser console + UI | Terminal with colors |
| **Covenant Builder** | Form inputs + dropdowns | Command parameters |
| **Script Analysis** | Visual results panel | Structured text output |
| **UTXO Management** | Interactive forms | Command-driven |
| **Automation** | Manual only | Scriptable commands |
| **Dependencies** | Modern browser | Node.js (chalk optional) |
| **Best Use Case** | Learning & exploration | Development & testing |

---

## 🔧 **Common Features Demonstrated**

Both demos showcase the complete SmartLedger-BSV functionality:

### **Core Capabilities**
- ✅ **Private Key & Address Generation** - Create BSV wallets
- ✅ **Transaction Building** - Construct valid BSV transactions  
- ✅ **Script Creation** - Build custom Bitcoin Scripts
- ✅ **UTXO Management** - Generate and spend test UTXOs
- ✅ **Preimage Parsing** - Extract BIP-143 transaction fields
- ✅ **Covenant Logic** - Create smart contract spending conditions

### **Smart Contract Types**
1. **Simple Covenants** - Basic spending restrictions
2. **Timelock Covenants** - Time-based spending conditions using preimage validation
3. **Multisig Covenants** - Multi-signature requirements
4. **Conditional Covenants** - IF/ELSE spending paths

### **Advanced Features**
- 🧾 **BIP-143 Preimage Extraction** - Parse transaction preimages
- 📊 **SIGHASH Analysis** - Understand signature hash types
- 🔍 **Script Debugging** - Step-through script execution
- ⚡ **Script Optimization** - Minimize script size and cost
- 🧪 **Local Testing** - Verify scripts without blockchain access

---

## 🚀 **Quick Start Guide**

### **For Visual Learners (HTML Demo)**
1. Open `smart_contract_demo.html` in your browser
2. Click "Load BSV Smart Contract Library"  
3. Explore each tab (Basics → Covenant → Preimage → UTXO → Scripts)
4. Try the real-world use case examples

### **For Developers (Node.js Demo)**
1. Run `node demos/smart_contract_demo.js`
2. Type `basics` to load and test the library
3. Try `covenant generate simple` to create your first covenant
4. Use `help` to see all available commands
5. Explore with `utxo generate`, `preimage sample`, etc.

---

## 📚 **Learning Path**

**Recommended progression through the demos:**

1. **🎯 Start Here:** `basics` - Understand core BSV functionality
2. **🏗️ Build:** `covenant generate` - Create your first smart contract  
3. **🔍 Analyze:** `preimage sample` - Understand transaction structure
4. **💎 Manage:** `utxo generate` - Handle UTXOs and spending
5. **🛠️ Script:** `scripts build` - Custom Bitcoin Script development
6. **🎓 Advanced:** `examples` - Real-world smart contract patterns

---

## 🔗 **Related Documentation**

- **[Usage Guide](../docs/SMARTLEDGER_BSV_USAGE_GUIDE.md)** - Complete API reference
- **[Usage Answers](../docs/SMARTLEDGER_BSV_USAGE_ANSWERS.md)** - FAQ and troubleshooting
- **[Smart Contract Guide](../docs/advanced/SMART_CONTRACT_GUIDE.md)** - Advanced development
- **[Examples Directory](../examples/)** - Additional code samples
- **[GitHub Repository](https://github.com/codenlighten/smartledger-bsv)** - Source code

---

## 🆘 **Support & Troubleshooting**

### **Common Issues**

**HTML Demo:**
- **Bundle not found:** Ensure `../bsv.bundle.js` exists (run `npm run build`)
- **CORS issues:** Serve via HTTP server, don't open file:// directly
- **Console errors:** Check browser developer tools for detailed errors

**Node.js Demo:**
- **Module errors:** Run `npm install` to ensure dependencies
- **Chalk missing:** Demo works without chalk (fallback to plain text)
- **Permission denied:** Use `chmod +x demos/smart_contract_demo.js`

### **Getting Help**

- **Issues:** [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **Documentation:** Check the `docs/` directory for detailed guides
- **Examples:** Browse `examples/` for working code samples

---

**Created by:** SmartLedger-BSV Development Team  
**Version:** v3.3.3  
**Last Updated:** October 30, 2025

*Both demos provide identical functionality - choose the interface that works best for your workflow!* 🎉