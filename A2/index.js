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
require('dotenv').config();
const SECRET_KEY = process.env.JWT_SECRET;

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

const multer  = require('multer');
const upload = multer({ dest: './public/data/uploads/' })

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
            return res.status(403).json({'error': "Unauthorized"});
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
    const now = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
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
    if (user.resetToken !== resetToken) {
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
    if (!utorid || !name || ! email) {
        return res.status(400).json({"error": "Invalid payload"})
    }
    if (typeof utorid !== 'string' || typeof name !== 'string' || typeof email !== 'string'){
        return res.status(400).json({"error": "Invalid payload"})
    }
    if ((utorid.length !== 7 && utorid.length !== 8) || !utorid.match(/^[a-z0-9]+$/)) {
        return res.status(400).json({"error": "Invalid payload"})
    }
    if(name.length > 50){
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
            expiresAt: expiresAt,
            createdAt: new Date(),
        },
    })

    if (createUser) {
        const promotions = await prisma.promotion.findMany({select: {id: true}});
        for (const promo of promotions) {
            await prisma.user.update({
                where: { utorid: createUser.utorid },
                data: { promotions: { connect: { id: promo.id } } }
            });
        }
    }

    return res.status(201).json({
        id: createUser.id,
        utorid: createUser.utorid,
        name: createUser.name,
        email: createUser.email,
        verified: createUser.verified,
        expiresAt: createUser.expiresAt,
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
        if (verified !== 'true' && verified !== 'false'){
            return res.status(400).json({"error": "Invalid verified payload"});
        }
        if (verified === true || verified === 'true') {
            where['verified'] = true;
        }
        if (verified === false || verified === 'false') {
            where['verified'] = false;
        }
    }
    if (activated !== undefined) {
        if (activated !== 'true' && activated !== 'false'){
            return res.status(400).json({"error": "Invalid verified payload"});
        }
        if (activated === 'true') {
            where['activated'] = true;
        }
        if (activated === 'false') {
            where['activated'] = false;
        }
    }
    if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1){
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

    return res.status(200).json({'count': count, "results": userList});
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

//users/:userId Update a specific user's various statuses and some information
app.patch('/users/:userId', jwtAuth, requireRole( "manager","superuser"), async (req, res) => {
    const user = req.user;

    const userId = Number.parseInt(req.params['userId']);
    if (isNaN(userId)) {
        return res.status(404).json({'error': 'Invalid url'});
    }

    const {email, verified, suspicious, role} = req.body;
    if(email === undefined && verified === undefined && suspicious === undefined && role === undefined){
        return res.status(400).json({"error": "Invalid payload"});
    }

    const data = {};
    const select = {
        'id': true,
        'utorid': true,
        'name': true,
    };
    if (email !== undefined && email !== null) {
        if (typeof email !== "string" || !email.match(/^[a-z0-9]+\.[a-z0-9]+@mail\.utoronto\.ca$/)) {
            return res.status(400).json({"error": "Invalid email"})
        }
        data['email'] = email;
        select['email'] = true;
    }
    if (suspicious !== undefined && suspicious !== null) {
        if (suspicious !== 'true' && suspicious !== 'false'){
            return res.status(400).json({"error": "Invalid suspicious payload"});
        }
        if (suspicious === true || suspicious === "true") {
            data['suspicious'] = true;
        } else if (suspicious === false || suspicious === "false") {
            data['suspicious'] = false;
        }
        select['suspicious'] = true;
    }
    if (verified !== undefined && verified !== null) {
        if (verified !== 'true' && verified !== true ){
            return res.status(400).json({"error": "Invalid verified payload"});
        }
        data['verified'] = true;
        select['verified'] = true;
    }
    if (role !== undefined && role !== null) {
        if (user.role === 'cashier' || user.role === 'regular') {
            return res.status(400).json({'error': 'unauthorized promotion'});
        }
        let rolesToPromote = ['cashier', 'regular'];
        if (user.role === 'superuser'){
            rolesToPromote = ['cashier', 'regular', 'manager', 'superuser'];
        }
        if (!rolesToPromote.includes(role)){
            return res.status(400).json({'error': 'unauthorized promotion'});
        }
        data['role'] = role;
        select['role'] = true;
    }

    const updateUser = await prisma.user.update({
        where: {id: userId},
        select,
        data
        });

    return res.status(200).json(updateUser);
});


//users/me Update the current logged-in use's information
app.patch("/users/me", jwtAuth, upload.single('avatar'), async (req, res) => {
    const {name, email, birthday, avatar} = req.body;
    const user = req.user;
    if(email === undefined && birthday === undefined && avatar === undefined && name === undefined){
        return res.status(400).json({"error": "Invalid payload"});
    }

    const data = {};
    const select = {
        'id':true,
        'utorid': true,
        'role': true,
        'points': true,
        'createdAt': true,
        'lastLogin': true,
        'verified': true,
    };

    if (name !== undefined) {
        if(name.length > 50 || typeof name !== "string"){
            return res.status(400).json({"error": "Invalid payload"})
        }
        data['name'] = name;
        select['name'] = true;
    }
    if (email !== undefined) {
        if (typeof email !== "string" ||!email.match(/^[a-z0-9]+\.[a-z0-9]+@mail\.utoronto\.ca$/) || typeof email !== "string") {
            return res.status(400).json({"error": "Invalid email"})
        }
        const findEmail = await prisma.user.findUnique({where: {email: email}});
        if (findEmail) {
            return res.status(400).json({"error": "Email already exist"})

        }
        data['email'] = email;
        select['email'] = true;
    }
    if (birthday !== undefined){
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || typeof birthday !== 'string'){
            return res.status(400).json({"error": "Invalid birthday"})
        }
        data['birthday'] = birthday;
        select['birthday'] = true;
    }
    if (avatar !== undefined) {
        if (typeof avatar !== 'string') {
            return res.status(400).json({"error": "Invalid avatar"})
        }
        if (req.file) {
            data.avatarUrl = `${req.file.filename}`;
            select['avatar'] = true;
        }
    }

    const updateUser = await prisma.user.update({
        where: {id: user.id},
        data,
        select
    })
    return res.status(200).json(updateUser);
});

//users/me Retrieve the current logged-in user's information
app.get("/users/me", jwtAuth, async (req, res) => {
    const user = req.user;

    const findUser = await prisma.user.findUnique({
        where: {id: user.id},
        omit: {
            password: true,
            activated: true,
            suspicious: true,
            expiresAt: true,
            resetToken: true
        },
        include: {promotions: true,}
    })

    if (!findUser) {
        return res.status(404).json({'error': 'User not found'});
    }

    return res.status(200).json(findUser);
})

//users/me/password Update the current logged-in user's password
app.patch("/users/me/password", jwtAuth, async (req, res)=> {
    const user = req.user;
    const oldpwd = req.body.old;
    const newpwd = req.body.new;

    if (typeof oldpwd !== 'string' || typeof newpwd !== 'string'){
        return res.status(400).json({"error": "Invalid payload"})
    }

    const findUser = await prisma.user.findUnique({where: {id: user.id}});
    if (!findUser) {
        return res.status(404).json({'error': 'User not found'});
    }
    if (findUser.password !== oldpwd) {
        return res.status(403).json({"error": "Incorrect current password"})
    }
    if (newpwd.length < 8 ||
        newpwd.length > 20 ||
        !/[A-Z]/.test(newpwd) ||
        !/[a-z]/.test(newpwd) ||
        !/[0-9]/.test(newpwd) ||
        !/[@$!%*?&]/.test(newpwd)
    ) {
        return res.status(400).json({"error": "Invalid payload"})
    }

    const updateUser = await prisma.user.update({
        where: {id: user.id},
        data: {password: newpwd}
    });
    return res.status(200).send();
});


//transactions -Create a new purchase transaction.
app.post("/transactions", jwtAuth, requireRole('cashier', 'manager', 'superuser'), async (req, res) => {
    const {utorid, type, spent, promotionIds, remark} = req.body;
    if (utorid === undefined || type === undefined || spent === undefined) {
        return res.status(400).json({"error": "Invalid payload"})
    }
})

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
    console.error(`cannot start server: ${err.message}`);
    process.exit(1);
});