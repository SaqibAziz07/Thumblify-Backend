import express from 'express';
import { getThumbnailbyId, getUsersThumbnails } from '../controllers/UserController.js';
const UserRouter = express.Router();
UserRouter.get('/thumbnails', getUsersThumbnails);
UserRouter.get('/thumbnail/:id', getThumbnailbyId);
export default UserRouter;
