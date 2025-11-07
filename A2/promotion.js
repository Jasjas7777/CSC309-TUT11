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

    if (minSpending !== null){
        if ( minSpending <= 0){
            return res.status(400).json({"error": "Invalid minSpending payload"})

        }
    }
    if (rate !== null){
        if (rate <= 0){
            return res.status(400).json({"error": "Invalid rate payload"})

        }
    }
    if (new Date(endTime) <= new Date(startTime)) {
        return res.status(400).json({ "error": "endTime must be after startTime" });
    }

    if( points !== undefined && points !== null){
        if ( points < 0 ) {
            return res.status(400).json({"error": "Invalid points payload"})
    }}

    const normalizedType = (type === 'one-time') ? 'onetime' : type;

    const createPromotion = await prisma.promotion.create({
        data: {
            name: name,
            description: description,
            type: normalizedType,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
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
    return res.status(201).json(createPromotion);
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
    const count = await prisma.promotion.count({where});
    return res.status(200).json({"count": count, "results": findPromotions});
})

//promotions/:promotionId
router.get('/:promotionId', jwtAuth, async (req, res) => {
    const id = Number.parseInt(req.params['promotionId']);
    if (isNaN(id)){
        return res.status(404).json({'error': 'invalid promotion id'});
    }
    const user = req.user;

    const findPromotion = await prisma.promotion.findUnique({
        where: {id: id}
    })
    if (!findPromotion) {
        return res.status(404).json({ "error": "promotion not found"});
    }
    const omit = {};
    if (user.role === 'regular' || user.role === 'cashier') {
        if (findPromotion.startTime > new Date() || findPromotion.endTime < new Date()) {
            return res.status(404).json({ "error": "promotion is gone" });
        }
        omit['startTime'] = true;
    }
    const findPromotionAgain  = await prisma.promotion.findUnique({ where: { id: id },
        omit
    });

    return res.status(200).json(findPromotion)
})

//promotions/:promotionId
router.patch('/:promotionId', jwtAuth, requireRole('manager', 'superuser') ,async (req, res) => {
    const id = Number.parseInt(req.params['promotionId']);
    if (isNaN(id)){
        return res.status(404).json({'error': 'invalid promotion id'});
    }
    const findPromotion = await prisma.promotion.findUnique({ where: { id: id }});
    if (!findPromotion) {
        return res.status(404).json({ "error": "promotion not found"});
    }
    const user = req.user;
    const { name, description, type, startTime, endTime } = req.body;
    const minSpending = req.body.minSpending || null;
    const rate = req.body.rate || null;
    const points = req.body.points || 0;
    const data = {};
    const select = {'id': true, 'name': true, 'type': true};

    if (name !== undefined && name !== null) {
        if (typeof name !== 'string' || new Date() > findPromotion.startTime){
            return res.status(400).json({"error": "Invalid name"});
        }
        data['name'] = name;
    }

    if (description !== undefined && description !== null) {
        if (typeof description !== 'string' || new Date() > findPromotion.startTime){
            return res.status(400).json({"error": "Invalid description"});
        }
        data['description'] = description;
    }
    if (type !== undefined && type !== null) {
        if (type !== 'automatic' && type !== 'one-time' || new Date() > findPromotion.startTime) {
            return res.status(400).json({"error": "Invalid type"});
        }
        if (type === 'one-time'){
            data['type'] = 'onetime';
        }
        data['type'] = type;
    }
    if (startTime !== undefined && startTime !== null) {
        if (!isIsoDate(startTime) ||isNaN(Date.parse(startTime))
        || new Date(startTime) < new Date() || new Date() > findPromotion.startTime
        || new Date(startTime) > findPromotion.endTime){
            return res.status(400).json({"error": "Invalid startTime payload"})
        }
        data['startTime'] = startTime;
        select['startTime'] = true;
    }

    if (endTime !== undefined && endTime !== null) {
        if (!isIsoDate(endTime) ||isNaN(Date.parse(endTime))
            || new Date(endTime)  <new Date() || new Date() > findPromotion.endTime
            || new Date(startTime) > findPromotion.endTime){
            return res.status(400).json({"error": "Invalid startTime payload"})
        }
        data['startTime'] = startTime;
        select['startTime'] = true;
    }

    if (minSpending !== undefined && minSpending !== null){
        if (typeof minSpending !== 'number' || minSpending <= 0 || new Date() > findPromotion.startTime){
            return res.status(400).json({"error": "Invalid minSpending payload"})
        }
        data['minSpending'] = minSpending;
        select['minSpending'] = true;
    }
    if (rate !== undefined && rate !== null){
        if (typeof rate !== 'number' || rate <= 0 || new Date() > findPromotion.startTime){
            return res.status(400).json({"error": "Invalid rate payload"})
        }
        data['rate'] = rate;
        select['rate'] = true;
    }

    if( points !== undefined && points !== null || new Date() > findPromotion.startTime){
        if (typeof points !== "number" || points <= 0 || !Number.isInteger(points)) {
            return res.status(400).json({"error": "Invalid points payload"})
        }
        data['points'] = points;
        select['points'] = true;
    }
    const updatedPromotion = await prisma.promotion.update({ where: { id: id },
        select, data
    });

    return res.status(200).json(updatedPromotion);
});

//delete
router.delete('/:promotionId', jwtAuth, requireRole('manager', 'superuser') ,async (req, res) => {
    const id = Number.parseInt(req.params['promotionId']);
    if (isNaN(id)){
        return res.status(404).json({'error': 'invalid promotion id'});
    }
    const findPromotion = await prisma.promotion.findUnique({ where: { id: id }});
    if (!findPromotion) {
        return res.status(404).json({ "error": "promotion not found"});
    }
    if (new Date() > findPromotion.startTime) {
        return res.status(403).json({ "error": "promotion  already started"});
    }

    const deletePromotion = await prisma.promotion.delete({ where: { id: id } });
    return res.status(204).send();
})


module.exports = router;