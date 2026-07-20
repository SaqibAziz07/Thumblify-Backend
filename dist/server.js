import "dotenv/config";
import express from 'express';
import cors from "cors";
import connectDB from "./configs/db.js";
import session from "express-session";
import MongoStore from "connect-mongo";
import AuthRouter from "./routes/AuthRoutes.js";
import ThumbnailRouter from "./routes/ThumbnailRoutes.js";
import UserRouter from "./routes/UserRoutes.js";
await connectDB();
const app = express();
// Middleware
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'https://localhost:5173', 'http://localhost:3000', 'https://localhost:3000'],
    credentials: true
}));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    })
}));
const port = Number(process.env.PORT) || 3000;
// const host = process.env.HOST || '0.0.0.0';
app.get('/', (req, res) => {
    res.send('Server is Live!');
});
app.use('/api/auth', AuthRouter);
app.use('/api/thumbnail', ThumbnailRouter);
app.use('/api/user', UserRouter);
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    // console.log(`Open http://127.0.0.1:${port} in your browser`);
});
