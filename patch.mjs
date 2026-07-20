import fs from 'fs';
import path from 'path';
const cwd = process.cwd();
const patch = (file, oldText, newText) => {
  const filePath = path.join(cwd, file);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(oldText)) {
    console.error('Old text not found in', file);
    console.error('Content snippet:', content.slice(0, 200));
    process.exit(1);
  }
  fs.writeFileSync(filePath, content.replace(oldText, newText), 'utf8');
  console.log('patched', file);
};
patch('vercel.json', '{\r\n  "rewrites": [\r\n    {\r\n      "source": "/(.*)",\r\n      "destination": "/server.ts"\r\n    }\r\n  ]\r\n}\r\n', '{\r\n  "version": 2,\r\n  "builds": [\r\n    {\r\n      "src": "server.ts",\r\n      "use": "@vercel/node"\r\n    }\r\n  ],\r\n  "routes": [\r\n    {\r\n      "src": "/(.*)",\r\n      "dest": "/server.ts"\r\n    }\r\n  ]\r\n}\r\n');
const oldServer = "app.use('/api/auth', AuthRouter);\r\napp.use('/api/thumbnail', ThumbnailRouter);\r\napp.use('/api/user', UserRouter);\r\napp.listen(port, () => {\r\n    console.log(`Server is running at http://localhost:${port}`);\r\n    // console.log(`Open http://127.0.0.1:${port} in your browser`);\r\n});\r\n";
const newServer = "app.use('/api/auth', AuthRouter);\r\napp.use('/api/thumbnail', ThumbnailRouter);\r\napp.use('/api/user', UserRouter);\r\n\r\nconst isVercel = process.env.VERCEL === '1';\r\nif (!isVercel) {\r\n    app.listen(port, () => {\r\n        console.log(`Server is running at http://localhost:${port}`);\r\n        // console.log(`Open http://127.0.0.1:${port} in your browser`);\r\n    });\r\n}\r\n\r\nexport default app;\r\n";
patch('server.ts', oldServer, newServer);
