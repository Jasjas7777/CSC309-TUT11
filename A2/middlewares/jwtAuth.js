const jwt = require('jsonwebtoken');
require('dotenv').config();
const SECRET_KEY = process.env.JWT_SECRET;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// JWT Auth middleware
module.exports = async function jwtAuth(req, res, next) {
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