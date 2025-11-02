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
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET;
const { PrismaClient } = require('@prisma/client');
const {uuidv4} = require("zod/v4");
const prisma = new PrismaClient();

app.use(express.json());

// JWT Auth middleware
function jwtAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({"error" : "Token is not in header"});
    }

    jwt.verify(token, SECRET_KEY, async (err, userData) => {
        if (err) {
            return res.status(401).json({"error": "Not authenticated"});
        }
        try {
            const user = await prisma.user.findUnique({
                where: {
                    utorid: userData.utorid
                },
            });
            if (!user) {
                return res.status(401).json({"error" : 'User not found'});
            } else {
                const updateLogin = await prisma.user.update({where : {
                    utorid: userData.utorid
                    },
                    data : {lastLogin: new Date(), activated: true}
                });
                req.user = user;
                next();
            }
        } catch (error) {
            res.status(401).json({"error" : 'Invalid token'});
        }
    });
}

//Clearance middleware
function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.user;
        if (!roles.includes(user.role.toLowerCase())){
            return res.status(401).json({'error': "Unauthorized"});
        }
        next();
    };
}

//auth/tokens Authenticate a user and generate a JWT token
app.post("/auth/tokens", async (req, res) => {
    const {utorid, password} = req.body;
    if (!utorid || !password || typeof utorid !== 'string' || typeof password !== 'string'){
        return res.status(400).json({"error": "Invalid payload"})
    }
    const user = await prisma.user.findUnique({where: {utorid: utorid}});
    if (!user) {
        return res.status(404).json({'error': "User not found"});
    }
    if (password !== user.password) {
        return res.status(401).json({'error': "Incorrect password"});
    }

    const token = jwt.sign({utorid: utorid}, SECRET_KEY, {expiresIn: '7d'});
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return res.status(200).json({"token": token, "expiresAt": expiresAt});
});

//auth/resets Request a password reset email
const reqList = {};

app.post("/auth/resets", async (req, res) => {
    const {utorid} = req.body;
    if (!utorid || typeof utorid !== 'string') {
        return res.status(400).json({"error": "Invalid payload"})
    }
    const user = await prisma.user.findUnique({where: {utorid: utorid}});
    if (!user) {
        return res.status(404).json({'error': "User not found"});
    }
    const expiresAt = new Date();
    const now = new Date()
    expiresAt.setDate(expiresAt.getHours() + 1)
    if (req.ip in reqList) {
        if (now - reqList[req.ip] < 60000) {
            return res.status(429).json({"error": "Too Many Requests"});
        }
    }
    reqList[req.ip] = now;
    const token = uuidv4();
    const updateUser = await prisma.user.update({where: {utorid: utorid},
        data: {
            expiresAt: expiresAt,
            resetToken: token
        }
    });
    return res.status(202).json({"expiresAt": expiresAt, "resetToken": token});
})

//auth/resets/:resetToken Reset the password of a user given a reset token
app.post("/auth/resets/:resetToken", async (req, res) => {
    const {utorid, password} = req.body;
    const {resetToken} = req.params;
    if (!utorid || !password || typeof utorid !== 'string' || typeof password !== 'string'){
        return res.status(400).json({"error": "Invalid payload"})
    }
    if (password.length < 8 ||
        password.length > 20 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[@$!%*?&]/.test(password)
    ) {
        return res.status(400).json({"error": "Invalid password"})
    }
    const token = await prisma.user.findMany({where: {resetToken: resetToken}});
    if (!token || token.length === 0) {
        return res.status(404).json({'error': "Reset Token not found"})
    }
    const user = await prisma.user.findUnique({where: {utorid: utorid}});
    if (!user) {
        return res.status(404).json({'error': "User not found"});
    }
    const now = new Date();
    if (user.resetToken !== token) {
        return res.status(401).json({'error': "Token not matched"})
    } else if (user.expiresAt < now) {
        return res.status(410).json({'error': "Reset token expired"});
    }

    const updateUser = await prisma.user.update({where: {utorid: utorid},
        data: {
            password: password
        },
    });
    return res.sendStatus(200);
});

//Users Register a new user
app.post('/users', jwtAuth, requireRole("cashier", "manager","superuser"), async (req, res) => {
    const {utorid, name, email} = req.body;
    if (!utorid || !password || typeof utorid !== 'string' || typeof name !== 'string' || typeof email !== 'string'){
        return res.status(400).json({"error": "Invalid payload"})
    }
    if (!email.match(/^[a-z0-9]+\.[a-z0-9]+@mail\.utoronto\.ca$/)) {
        return res.status(400).json({"error": "Invalid email"})
    }

    const findUser = await prisma.user.findUnique({
        where: { utorid: utorid,
        },
    });
    if (findUser) {
        return res.status(409).json({'error': "User already exist"});
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = uuidv4();

    const createUser = await prisma.user.create({
        data: {
            utorid: utorid,
            email: email,
            name: name,
            role: "regular",
            verified: false,
            resetToken: token,
            expiresAt: expiresAt
        },
    })

    if (createUser) {
        const promotions = await prisma.promotion.findMany({select: {id: true}});
        for (const promo in promotions) {
            const updateUser = await prisma.user.update({
                where: {utorid: createUser.utorid},
                data: {promotions: {connect: {id: promo.id}}}
            })
        }
    }

    return res.status(200).json({
        id: createUser.id,
        utorid: createUser.utorid,
        name: createUser.name,
        email: createUser.email,
        verified: createUser.verified,
        resetToken: token
    })
});

//users retrieve a list of users
app.get('/users', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const {name, role, verified, activated } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const where = {};
    if (name !== undefined) {
        if (typeof name !== 'string'){
            return res.status(400).json({"error": "Invalid name"});
        }
        where['name'] = name;
    }
    if (role !== undefined) {
        const validRoles = ['regular', 'cashier', 'manager', 'superuser'];
        if (!validRoles.includes(role.toLowerCase())){
            return res.status(400).json({"error": "Invalid role"});
        }
        where['role'] = role;
    }
    if (verified !== undefined) {
        if (typeof verified !== 'boolean'){
            return res.status(400).json({"error": "Invalid verified payload"});
        }
        where['verified'] = verified;
    }
    if (activated !== undefined) {
        if (typeof activated !== 'boolean'){
            return res.status(400).json({"error": "Invalid activated payload"});
        }
        where['activated'] = activated;
    }
    if (!Number.isInteger(page) || !Number.isInteger(limit)){
        return res.status(400).json({"error": "Invalid payload"});
    }

    const skip = (page - 1) * limit;
    const userList = await prisma.user.findMany({
        where,
        select: {
            id: true,
            utorid: true,
            name: true,
            email: true,
            birthday: true,
            role: true,
            points: true,
            createdAt: true,
            lastLogin: true,
            verified: true,
            avatarUrl: true
        },
        skip,
        take: limit,
        }
    )

    const count = await prisma.user.count({where});

    return res.status(200).json({'count': count, "result": userList});
})


//users/:userId retrieve a specific user
app.get('/users/:userId', jwtAuth, requireRole("cashier", "manager","superuser"), async (req, res) => {
    const user = req.user;

    const userId = Number.parseInt(req.params['userId']);
    if (isNaN(userId)) {
        return res.status(404).json({'error': 'Invalid url'});
    }

    const select = {
        id: true,
        utorid: true,
        name: true,
        points: true,
        verified: true,
        promotions: true,
    }

    if (user.role.toLowerCase() !== 'cashier') {
        select["email"] = true;
        select["birthday"] = true;
        select["role"] = true;
        select["createdAt"] = true;
        select["lastLogin"] = true;
        select["avatarUrl"] = true;
    }

    const userFound = await prisma.user.findUnique({
        where: {id: userId},
        select,
    });

    if (!userFound) {
        return res.status(404).json({'error': "User not found"});
    }

    return res.status(200).json(userFound);
})

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
    console.error(`cannot start server: ${err.message}`);
    process.exit(1);
});