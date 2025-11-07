const express = require("express");
const app = express();

const jwtAuth = require("./middlewares/jwtAuth");
const requireRole = require("./middlewares/requireRole");

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

app.use(express.json());

function isIsoDate(date) {
    if (typeof date !== "string") return false;

    const isoPattern =
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

    if (!isoPattern.test(date)) return false;


    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
}

router.post('/', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const { name, description, type, startTime, endTime } = req.body;
    const minSpending = req.body.minSpending || null;
    const rate = req.body.rate || null;
    const points = req.body.points || 0;

    if (typeof name !== 'string'){
        return res.status(400).json({"error": "Invalid name"});
    }
    if (typeof description !== 'string'){
        return res.status(400).json({"error": "Invalid description"});
    }
    if (type !== 'automatic' && type !== 'one-time'){
        return res.status(400).json({"error": "Invalid type"});
    }
    if (!isIsoDate(startTime)){
        return res.status(400).json({"error": "Invalid startTime payload"})
    }
    if (!isIsoDate(endTime) || new Date(endTime) < new Date(startTime)){
        return res.status(400).json({"error": "Invalid endTime payload"})
    }
    if (minSpending !== undefined && minSpending !== null){
        if (typeof minSpending !== 'number' || minSpending <= 0){
            return res.status(400).json({"error": "Invalid minSpending payload"})

        }
    }
    if (rate !== undefined && rate !== null){
        if (typeof rate !== 'number' || rate <= 0){
            return res.status(400).json({"error": "Invalid rate payload"})

        }
    }
    if (minSpending !== undefined && minSpending !== null){
        if (typeof minSpending !== 'number' || minSpending <= 0){
            return res.status(400).json({"error": "Invalid minSpending payload"})

        }
    }
    if( points !== undefined && points !== null){
        if (typeof points !== "number" || points <= 0 || !Number.isInteger(points)) {
            return res.status(400).json({"error": "Invalid points payload"})
    }}

    const createPromotion = await prisma.promotion.create({
        data: {
            name: name,
            description: description,
            type: type,
            startTime: startTime,
            endTime: endTime,
            minSpending: minSpending,
            rate: rate,
            points: points
        }
    })
    if (createPromotion){
        const users = await prisma.user.findMany({select: {id: true}});
        for (const user of users){
            const updateUser = await prisma.user.update({
                where: {id: user.id},
                data: {promotions: {connect: {id: createPromotion.id}}}
            })
        }
    }
    return res.status(200).json(createPromotion);
});

router.get('/', jwtAuth, async (req, res) => {
    const {name, type, started, ended} = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const where = {};
    if (name !== undefined && name !== null) {
        if (typeof name !== 'string'){
            return res.status(400).json({"error": "Invalid name"});
        }
        where['name'] = name;
    }
    if (type !== undefined && type !== null) {
        if (typeof type !== 'string'){
            return res.status(400).json({"error": "Invalid type"});
        }
        where['type'] = type;
    }

    const omit = {};
    if (req.user.role === 'regular' || req.user.role === 'cashier') {
        where['startTime'] =  { 'lte': new Date() };
        where['endTime'] = {'gt': new Date() };
        where['users'] = { 'some': {'id': req.user.id } };
        omit['startTime'] = true;
    } else if(req.user.role === 'manager' || req.user.role === 'superuser'){
        if (started !== undefined && started !== null) {
            if ((started !== 'true' && started !== 'false') || ended !== undefined){
                return res.status(400).json({"error": "Invalid started"});
            }
            let start = false;
            if (started === 'true') {
                start = true;
            } else if (started === 'false') {
                start = false;
            }
            where['startTime'] = start ? { 'lte': new Date() } : {'gt': new Date() };
        }

        if (ended !== undefined && ended !== null) {
            if (ended !== 'true' && ended !== 'false'){
                return res.status(400).json({"error": "Invalid ended"});
            }
            let end = false;
            if (ended === 'true') {
                end = true;
            } else if (ended === 'false') {
                end = false;
            }
            where['endTime'] = end ? { 'lte': new Date() } : {'gt': new Date() };
        }
    }
    if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1){
        return res.status(400).json({"error": "Invalid payload"});
    }

    const skip = (page - 1) * limit;
    const findPromotions = await prisma.promotion.findMany({
        where, omit, skip, take: limit
    })
    const count = await prisma.transaction.count({where});
    return res.status(200).json({"count": count, "results": findPromotions});
})

module.exports = router;