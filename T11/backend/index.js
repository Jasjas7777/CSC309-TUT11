import express from "express";
import routes from "./routes.js";
// TODO: complete me (loading the necessary packages)

const cors = require('cors');
const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));

// TODO: complete me (CORS)
app.use(express.json());

export default app;