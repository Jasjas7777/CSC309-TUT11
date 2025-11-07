const express = require("express");
const app = express();

const jwtAuth = require("./middlewares/jwtAuth");
const requireRole= require("./middlewares/requireRole");

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();

const multer  = require('multer');
const upload = multer({ dest: './public/data/uploads/' })

const router = express.Router();

app.use(express.json());


//Users Register a new user
router.post('/', jwtAuth, requireRole("cashier", "manager","superuser"), async (req, res) => {
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
router.get('/', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
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

//users/me Update the current logged-in use's information
router.patch("/me", jwtAuth, upload.single('avatar'), async (req, res) => {
    const {name, email, birthday} = req.body;
    const user = req.user;
    if(!email && !birthday && !name && !req.file){
        return res.status(400).json({"error": "Invalid payload"});
    }
    if(email == null && birthday === null && name === null && req.file === null){
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
        'name': true,
        'email': true,
        'avatarUrl':true,
        'birthday': true
    };

    if (name !== undefined && name !== null) {
        if(name.length > 50 || typeof name !== "string"){
            return res.status(400).json({"error": "Invalid payload"})
        }
        data['name'] = name;
    }
    if (email !== undefined && email !== null) {
        if (typeof email !== "string" ||!email.match(/^[a-z0-9]+\.[a-z0-9]+@mail\.utoronto\.ca$/)) {
            return res.status(400).json({"error": "Invalid email"})
        }
        const findEmail = await prisma.user.findUnique({where: {email: email}});
        if (findEmail) {
            return res.status(400).json({"error": "Email already exist"})

        }
        data['email'] = email;
    }
    if (birthday !== undefined && birthday !== null){
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || typeof birthday !== 'string'){
            return res.status(400).json({"error": "Invalid birthday"})
        }
        const [year, month, day] = birthday.split("-").map(Number);
        const now = new Date();
        if (year > now.getFullYear() || month < 1 || month > 12 || day < 1 || day > 31
            || (month === 2 && day > 28)) {
            return res.status(400).json({"error": "Invalid birthday"})
        }
        data['birthday'] = new Date(birthday);
    }

    if (req.file) {
        data.avatarUrl = `${req.file.filename}`;
    }

    const updateUser = await prisma.user.update({
        where: {id: user.id},
        data,
        select
    })
    return res.status(200).json(updateUser);
});

//users/me Retrieve the current logged-in user's information
router.get("/me", jwtAuth, async (req, res) => {
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
router  .patch("/me/password", jwtAuth, async (req, res)=> {
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


//users/:userId retrieve a specific user
router.get('/:userId', jwtAuth, requireRole("cashier", "manager","superuser"), async (req, res) => {
    const user = req.user;

    const userId = Number.parseInt(req.params['userId']);
    if (isNaN(userId)) {
        return res.status(404).json({'error': 'Invalid userId'});
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
router.patch('/:userId', jwtAuth, requireRole( "manager","superuser"), async (req, res) => {
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
        if (suspicious !== 'true' && suspicious !== 'false' && suspicious !== true && suspicious !== false ){
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
        const allowedRoles = ['cashier', 'regular', 'manager', 'superuser' ];
        const rolesToPromote = ['cashier', 'regular'];
        if (typeof role !== "string") {
            return res.status(400).json({'error': 'Invalid payload'});
        }
        if (user.role === 'manager' && !(rolesToPromote.includes(role.toLowerCase()))){
            return res.status(403).json({'error': 'Unauthorized promotion'});
        }
        if (!(allowedRoles.includes(role.toLowerCase()))){
            return res.status(400).json({'error': 'Invalid payload'});
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

module.exports = router;