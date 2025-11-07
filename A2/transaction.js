const express = require("express");
const app = express();

const jwtAuth = require("./middlewares/jwtAuth");
const requireRole = require("./middlewares/requireRole");

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

app.use(express.json());

//transactions Create a new purchase transaction.
router.post('/', jwtAuth, requireRole('cashier', 'manager', 'superuser'), async (req, res) => {
    const {utorid, type, spent, promotionIds, remark} = req.body;
    if (type === undefined || type === null || utorid === undefined || utorid === null || spent === undefined || spent === null){
        return res.status(400).json({ "error": "Invalid payload" });
    }

    const data = {};
    if (typeof utorid !== "string"){
        return res.status(400).json({ "error": "Invalid utorid payload" });
    }
    const findUser = await prisma.user.findUnique({where: {utorid: utorid}, include: {promotions: true}});
    if (!findUser){
        return res.status(404).json({ "error": "User not found" });
    }

    if (typeof type !== 'string' || (type !== 'purchase' && type !== 'adjustment')){
        return res.status(400).json({ "error": "Invalid type payload" });
    }
    if (typeof spent !== 'number' || spent <= 0 ){
        return res.status(400).json({ "error": "Invalid spent payload"});
    }
    if (remark !== undefined && remark !== null){
        if (typeof remark !== "string"){
            return res.status(400).json({ "error": "Invalid remark payload"});
        }
        data['remark'] = remark;
    }

    let pointsAwarded = 0;
    if (promotionIds !== undefined && promotionIds !== null){
        if (!Array.isArray(promotionIds)){
            return res.status(400).json({ "error": "Invalid promotionIds payload"});
        }
        for (const promoId of promotionIds){
            if (!Number.isInteger(promoId)){
                return res.status(400).json({ "error": "Invalid promotionIds payload"});
            }
            const findPromotion = await prisma.promotion.findUnique({
                where: {id: promoId}
            });
            if (!findPromotion) {
                return res.status(400).json({"error": "Promotion does not exist"});
            }
            const isUnused = findUser.promotions.some(promotion => promotion['id'] === promoId);
            if (!isUnused){
                return res.status(400).json({"error": "Promotion used"});
            }
            if (findPromotion.minSpending > spent){
                return res.status(400).json({"error": "Promotion not satisfied"});
            }
            if (findPromotion.endTime < new Date() || findPromotion.startTime > new Date()){
                return res.status(400).json({"error": "Promotion expire"});
            }
            if (findPromotion.type === 'one-time'){
                let promotionPoint = 0;
                const oldRate = findPromotion.rate;
                if (oldRate){
                    promotionPoint = Math.round(oldRate * 100 * spent);
                }
                pointsAwarded = pointsAwarded + findPromotion.points + promotionPoint;
            }
        }


        if (type === 'purchase'){
            pointsAwarded += Math.round(spent / 0.25);
            if (req.user.suspicious){
                data['suspicious'] = true;
            } else {
                const updateUser = await prisma.user.update({
                    where: {utorid: utorid},
                    data: {points: findUser.points + pointsAwarded},
                });
            }
            data["utoridUser"] = {connect: {utorid: utorid}};
            data["type"] = type;
            data['spent'] = spent;
            data['createdBy'] = req.user.utorid;
            data['amount'] = pointsAwarded;

            const createTransaction = await prisma.transaction.create({data});
            for (const promoId of promotionIds){
                let updatePromotion = await prisma.promotion.update({
                    where: {id: promoId},
                    data: {users: {disconnect: {utorid: utorid}},
                            transactions: {connect: {id: createTransaction.id}}
                    }
                });

            }
            const findTransaction = await prisma.transaction.findUnique({
                where: {id: createTransaction.id},
                select: {
                    id: true,
                    utorid: true,
                    type: true,
                    spent: true,
                    amount: true,
                    remark: true,
                    promotionIds: {select: {id: true}},
                    createdBy: true,
                }
            })
            if (req.user.suspicious){
                return res.status(201).json({
                    'id': findTransaction.id,
                    'utorid': findTransaction.utorid,
                    'type': findTransaction.type,
                    "spent": findTransaction.spent,
                    "earned": 0,
                    "remark": findTransaction.remark,
                    "promotionIds": promotionIds,
                    "createdBy": findTransaction.createdBy
                });
            }
            return res.status(201).json({
                'id': findTransaction.id,
                'utorid': findTransaction.utorid,
                'type': findTransaction.type,
                "spent": findTransaction.spent,
                "earned": findTransaction.amount,
                "remark": findTransaction.remark,
                "promotionIds": promotionIds,
                "createdBy": findTransaction.createdBy
            });
        }
        else if (type === 'adjustment'){
            const {relatedld, amount} = req.body;
            if (relatedld === undefined || relatedld === null || amount === undefined || amount === null){
                return res.status(400).json({ "error": "Invalid payload"});
            }
            if (typeof amount !== 'number' || !Number.isInteger(amount)) {
                return res.status(400).json({ "error": "invalid amount payload" });
            }
            const relatedTransaction = await prisma.transaction.findUnique({id: relatedld});
            if (!relatedTransaction){
                return res.status(404).json({ "error": "Transaction not found" });
            }
            data['type'] = type;
            data['amount'] = amount;
            data['relatedId'] = relatedld;
            const updateUser = await prisma.user.update({
                where: {utorid: utorid},
                data: {points: findUser.points + amount}
            })
            const newTransaction = await prisma.transaction.create({data});
            for (const promoId of promotionIds){
                let updatePromotion = await prisma.promotion.update({
                    where: {id: promoId},
                    data: {users: {disconnect: {utorid: utorid}},
                        transactions: {connect: {id: newTransaction.id}}
                    }
                });

            }
            const findTransaction = await prisma.transaction.findUnique({
                where: {id: newTransaction.id},
                select: {
                    id: true,
                    utorid: true,
                    type: true,
                    amount: true,
                    remark: true,
                    promotionIds: {select: {id: true}},
                    createdBy: true,
                }
            });
            return res.status(201).json({
                'id': findTransaction.id,
                'utorid': findTransaction.utorid,
                'type': findTransaction.type,
                "amount": findTransaction.amount,
                "relatedId": relatedld,
                "remark": findTransaction.remark,
                "promotionIds": promotionIds,
                "createdBy": findTransaction.createdBy
            });
        } else {
            return res.status(400).json({ "error": "invalid type" });
        }
    }
})

//transacitons/get Retrieve a list of transactions

module.exports = router;