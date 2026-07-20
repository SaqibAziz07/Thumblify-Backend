const fs = require('fs');
const path = require('path');
function patch(file, oldText, newText) {
  const filePath = path.join(process.cwd(), file);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(oldText)) {
    console.error('Old text not found in', file);
    process.exit(1);
  }
  fs.writeFileSync(filePath, content.replace(oldText, newText), 'utf8');
  console.log('patched', file);
}

patch('vercel.json', '{\n  "rewrites": [\n    {\n      "source": "/(.*)",\n      "destination": "/server.ts"\n    }\n  ]\n}\n', '{\n  "version": 2,\n  "builds": [\n    {\n      "src": "server.ts",\n      "use": "@vercel/node"\n    }\n  ],\n  "routes": [\n    {\n      "src": "/(.*)",\n      "dest": "/server.ts"\n    }\n  ]\n}\n');

const oldServer = "app.use('/api/auth', AuthRouter);\napp.use('/api/thumbnail', ThumbnailRouter);\napp.use('/api/user', UserRouter);\napp.listen(port, () => {\n    console.log(`Server is running at http://localhost:${port}`);\n    // console.log(`Open http://127.0.0.1:${port} in your browser`);\n});\n";
const newServer = "app.use('/api/auth', AuthRouter);\napp.use('/api/thumbnail', ThumbnailRouter);\napp.use('/api/user', UserRouter);\n\nconst isVercel = process.env.VERCEL === '1';\nif (!isVercel) {\n    app.listen(port, () => {\n        console.log(`Server is running at http://localhost:${port}`);\n        // console.log(`Open http://127.0.0.1:${port} in your browser`);\n    });\n}\n\nexport default app;\n";
patch('server.ts', oldServer, newServer);
