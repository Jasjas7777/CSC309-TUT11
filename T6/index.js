#!/usr/bin/env node
'use strict';

const port = (() => {
    const args = process.argv;

    if (args.length !== 3) {
        console.error("usage: node index.js port");
        process.exit(1);
    }

    const num = parseInt(args[2], 10);
    if (isNaN(num)) {
        console.error("error: argument must be an integer.");
        process.exit(1);
    }

    return num;
})();

const express = require("express");
const app = express();
app.use(express.json());
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const basicAuth = require('./middleware/basicAuth');


app.post("/users", async (req, res) => {
    const {username, password} = req.body;

    if (!username || !password){
        return res.status(400).json({message: "Invalid payload"});
    }

    const exist_user = await prisma.user.findUnique({where: {username}});
    if (exist_user) {
        return res.status(409).json({message: "A user with that username already exists"});
    }

    const user = await prisma.user.create({data: {username, password}});
    res.status(201).json(user);
});

app.post("/notes", basicAuth, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({message: "Not authenticated"});
    }

    const { title, description, completed, public: isPublic } = req.body;

    if (
        title === undefined ||
        description === undefined ||
        completed === undefined ||
        isPublic === undefined
    ) {
        return res.status(400).json({message: "Invalid payload"});
    }

    const note = await prisma.note.create({
        data: {
            title,
            description,
            completed,
            public: isPublic,
            userId: req.user.id,
        },
    });
    res.status(201).json(note);
});


app.get("/notes", async (req, res) => {
    const done = req.query.done

    if (done && done !== "true" && done !== "false") {
        return res.status(400).json({message: "Invalid payload"});
    }

    let filter = {public: true};

    if (done === "true") {
        filter.completed = true;
    } else if (done === "false") {
        filter.completed = false;
    }

    const notes = await prisma.note.findMany({where: filter});
    res.json(notes);
});

app.get("/notes/:noteId", basicAuth, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({message: "Not authenticated"});
    }

    const noteId = parseInt(req.params.noteId, 10);
    if (isNaN(noteId)) {
        return res.status(404).json({ message: "Not found" });
    }

    const note = await prisma.note.findUnique({where: {id: noteId}});
    if (!note) {
        return res.status(404).json({ message: "Not found" });
    }
    if (note.userId !== req.user.id){
        return res.status(403).json({ message: "Not permitted" });
    }

    res.json(note);
});


app.patch("/notes/:noteId", basicAuth, async (req, res) => {
    if (!req.user) {
        return res.status(401).json({message: "Not authenticated"});
    }

    const noteId = parseInt(req.params.noteId, 10);
    if (isNaN(noteId)) {
        return res.status(404).json({ message: "Not found" });
    }

    const note = await prisma.note.findUnique({where: {id: noteId}});
    if (!note) {
        return res.status(404).json({ message: "Not found" });
    }
    if (note.userId !== req.user.id){
        return res.status(403).json({ message: "Not permitted" });
    }

    const {title, description, completed, public:isPublic} = req.body;

    if (!req.user) {
        return res.status(401).json({message: "Not authenticated"});
    }

    if (
        title === undefined &&
        description === undefined &&
        completed === undefined &&
        isPublic === undefined
    ) {
        return res.status(400).json({message: "Invalid payload"});
    }

    const updated = await prisma.note.update({
        where: { id: noteId},
        data: {title, description, completed,
            public: isPublic},
    });
    res.json(updated);

});


// ==================

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
    console.error(`cannot start server: ${err.message}`);
    process.exit(1);
});


app.get('/hello', basicAuth, (req, res) => {
    if (req.user) {
        res.json(req.user);
    } else {
        res.status(401).json({ message: 'Unauthorized' });
    }
});

