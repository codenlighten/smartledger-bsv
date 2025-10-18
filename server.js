const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8080;

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  console.log(`Request for ${req.url}`);
  
  // Parse URL and remove query string
  let filePath = req.url.split('?')[0];
  
  // Default to index.html if no specific file requested
  if (filePath === '/') {
    filePath = '/test.html';
  }
  
  // Build full file path
  const fullPath = path.join(__dirname, filePath);
  
  // Get file extension
  const extname = path.extname(fullPath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // Check if file exists
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code == 'ENOENT') {
        // File not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>404 - File Not Found</h1>
              <p>The requested file <strong>${req.url}</strong> was not found.</p>
              <p><a href="/test.html">Go to BSV Security Test</a></p>
            </body>
          </html>
        `);
      } else {
        // Server error
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      // Success - serve the file
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache' // Prevent caching for development
      });
      res.end(content);
    }
  });
});

server.listen(port, () => {
  console.log(`
🚀 SmartLedger BSV Test Server Started!

📍 Server running at: http://localhost:${port}
🧪 Test page: http://localhost:${port}/test.html
📁 Serving files from: ${__dirname}

📊 Available files:
- test.html (Main test page)
- bsv.min.js (${Math.round(fs.statSync('bsv.min.js').size / 1024)} KB)
- bsv-message.min.js (${Math.round(fs.statSync('bsv-message.min.js').size / 1024)} KB)
- bsv-ecies.min.js (${Math.round(fs.statSync('bsv-ecies.min.js').size / 1024)} KB)
- bsv-mnemonic.min.js (${Math.round(fs.statSync('bsv-mnemonic.min.js').size / 1024)} KB)

Press Ctrl+C to stop the server
  `);
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});