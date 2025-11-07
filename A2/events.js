const express = require("express");
const app = express();

const jwtAuth = require("./middlewares/jwtAuth");
const requireRole = require("./middlewares/requireRole");
const { PrismaClient } = require('@prisma/client');
const e = require("express");
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

//events Create a new point-earning event.
router.post('/', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const {name, description, location, startTime, endTime, capacity, points} = req.body;

    if (name === undefined || name === null || typeof name !== "string" ) {
        return res.status(400).json({"error": "Invalid name payload"})
    }
    if (description === undefined || description === null || typeof description !== "string" ) {
        return res.status(400).json({"error": "Invalid description payload"})
    }
    if (location === undefined || location === null || typeof location !== "string" ) {
        return res.status(400).json({"error": "Invalid location payload"})
    }
    if (!isIsoDate(startTime)){
        return res.status(400).json({"error": "Invalid startTime payload"})
    }
    if (!isIsoDate(endTime) || new Date(endTime) < new Date(startTime)){
        return res.status(400).json({"error": "Invalid endTime payload"})
    }
    if (capacity !== undefined && capacity !== null) {
        if (typeof capacity !== "number" || capacity <= 0 || !Number.isInteger(capacity)){
            return res.status(400).json({"error": "Invalid capacity payload"})
        }
    }
    if (points === undefined || points === null || typeof points !== "number" || points <= 0 || !Number.isInteger(points)) {
        return res.status(400).json({"error": "Invalid location payload"})
    }

    const newEvent = await prisma.event.create({
        data: {
            name: name,
            description: description,
            location: location,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            capacity: capacity,
            pointsRemain: points,
        }
    });

    const response = await prisma.event.findUnique({
        where: {id: newEvent.id},
        include: { organizers: true, guests: true },
        omit: {
            numGuests: true
        }
    });

    return res.status(201).json(response);
});

//events Retrieve a list of events
router.get('/', jwtAuth, async (req, res) => {
    const {name, location, started, ended} = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const showFull = req.query.showFull || 'false';

    const where = {};
    if (name !== undefined && name !== null) {
        if (typeof name !== 'string'){
            return res.status(400).json({"error": "Invalid name"});
        }
        where['name'] = name;
    }

    if (location !== undefined && location !== null) {
        if (typeof location !== 'string'){
            return res.status(400).json({"error": "Invalid location"});
        }
        where['location'] = location;
    }

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

    if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1){
        return res.status(400).json({"error": "Invalid payload"});
    }

    if (showFull !== undefined && showFull !== null) {
        if (showFull !== 'false' && showFull !== true) {
            return res.status(400).json({"error": "Invalid payload"});
        }
        if (showFull === 'false'){
            where['OR'] = [{'numGuests': { 'lt': prisma.event.fields.capacity }},{'capacity': null} ];
        }
    }

    const omit = {'description': true};
    if (req.user.role === 'regular' || req.user.role === 'cashier') {
        where['published'] = true;
        omit['pointsRemain'] = true;
        omit['pointsAwarded'] = true;
        omit['published'] = true;
    } else if(req.user.role === 'manager' || req.user.role === 'superuser'){
        const {published} = req.query;
        if (published !== undefined && published !== null){
            if (published === 'true'){
                where['published'] = true;
            } else if (published === 'false'){
                where['published'] = false;
            } else {
                return res.status(400).json({"error": "Invalid payload"});
            }
        }
    }

    const skip = (page - 1) * limit;
    const findEvent = await prisma.event.findMany({
        omit, where,skip,take: limit
    })
    const count = await prisma.event.count({where});
    return res.status(200).json({'count': count, 'results': findEvent});
})


//events/:eventId Retrieve a single event
router.get('/:eventId', jwtAuth, async (req, res) => {
    const id = Number.parseInt(params['eventId']);
    if (isNaN(id)){
        return res.status(404).json({'error': 'invalid event id'});
    }
    const omit = {};
    if (req.user.role === 'regular' || req.user.role === 'cashier'){
        omit['description'] = true;
        omit['pointsRemain'] = true;
        omit['pointsAwarded'] = true;
        omit['published'] = true;
        omit['guests'] = true;
    }
    if (req.user.role === 'manager' || req.user.role === 'superuser'){
        omit['description'] = true;
    }
    const findEvent = await prisma.event.findUnique({
        where: {id: id},
        select: {published: true},
        omit: omit
    })

    if (!findEvent) {
        return res.status(404).json({ "error": "event not found"});
    }
    return res.status(200).json(findEvent);
});

//events/:eventId Update an existing event.
router.patch('/:eventId', jwtAuth, async (req, res) => {
    const user = req.user;
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include: {organizers: true}});
    if (!findEvent) {
        return res.status(404).json({ "error": "event not found" });
    }
    const isOrganizer = findEvent.organizers.some(organizer => organizer['id'] === user.id);
    if (user.role !== 'manager' && user.role !== 'superuser' && !isOrganizer){
        return res.status(403).json({ "error": "Not authorized to change event" });
    }

    const {name, description, location, startTime, endTime, capacity, points, published} = req.body;
    if (name === undefined && description === undefined && location === undefined
        && startTime === undefined && endTime === undefined && capacity === undefined
        && points === undefined && published === undefined) {
        return res.status(400).json({"error": "Invalid empty payload"})
    } else if (name === null && description === null && location === null
        && startTime === null && endTime === null && capacity === null
        && points === null && published === null){
        return res.status(400).json({"error": "Invalid empty payload"})
    }
    if (new Date() > findEvent.startTime){
        return res.status(400).json({"error": "Cannot update after start"})
    }

    const data = {};
    const select = {'id': true, 'name': true, 'location': true};
    if (name !== undefined && name !== null) {
        if (typeof name !== "string" ){
            return res.status(400).json({"error": "Invalid name payload"})
        }
        data['name'] = name;
        select['name'] = true;
    }
    if (description !== undefined && description !== null) {
        if (typeof description !== "string" ){
            return res.status(400).json({"error": "Invalid description payload"})
        }
        data['description'] = description;
        select['description'] = true;
    }
    if (location !== undefined && location !== null) {
        if (typeof location !== 'string'){
            return res.status(400).json({"error": "Invalid location"});
        }
        data['location'] = location;
        select['location'] = true;
    }
    if (startTime !== undefined && startTime !== null){
        if (!isIsoDate(startTime) || new Date(startTime) < new Date() || new Date(startTime) > findEvent.endTime || new Date() > findEvent.startTime ){
            return res.status(400).json({"error": "Invalid startTime payload"})
        }
        data['startTime'] = startTime;
        select['startTime'] = true;
    }
    if (endTime !== undefined && endTime !== null && startTime !== undefined && startTime !== null){
        if (!isIsoDate(endTime) || new Date(endTime) < new Date(startTime)){
            return res.status(400).json({"error": "Invalid endTime payload"})
        }
        data['endTime'] = endTime;
        select['endTime'] = true;
    }

    if (capacity !== undefined && capacity !== null) {
        if (typeof capacity !== "number" || capacity <= 0 || !Number.isInteger(capacity) || capacity < findEvent.numGuests){
            return res.status(400).json({"error": "Invalid capacity payload"})
        }
        data['capacity'] = capacity;
        select['capacity'] = true;
    }
    if (points !== undefined && points !== null) {
        if (typeof points !== "number" || points <= 0 || !Number.isInteger(points) || points < findEvent.pointsAwarded){
            return res.status(400).json({"error": "Invalid points payload"})
        }
        if (user.role !== 'manager' && user.role !== 'superuser'){
            return res.status(403).json({ "error": "Not authorized to change event" });
        }
        data['pointsRemain'] = points - findEvent.pointsAwarded;
        select['pointsRemain'] = true;
    }
    if (published !== undefined && published !== null){
        if (typeof published !== "boolean" || published !== true){
            return res.status(400).json({"error": "Invalid published payload"})
        }
        if (user.role !== 'manager' && user.role !== 'superuser'){
            return res.status(403).json({ "error": "Not authorized to change event" });
        }
        data['published'] = true;
        select['published'] = true;
    }

    const updateEvent = await prisma.event.update({
        where: {id: eventId},
        data, select,
    });

    return res.status(200).json(updateEvent);
})

//events/:eventId Remove the specified event.
router.delete('/:eventId', jwtAuth, requireRole('manager','superuser'), async (req, res) => {
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include: {organizers: true}});
    if (!findEvent) {
        return res.status(404).json({ "error": "event not found" });
    }
    if (findEvent.published === 'true' || findEvent.published === true){
        return res.status(400).json({ "error": "event already published" });
    }
    const updateEvent = await prisma.event.delete({
        where: {id: eventId},
    });
    return res.status(204).send();
})

//events/:eventId/organizers Add an organizer to this event.
router.post('/:eventId/organizers', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }

    const {utorid} = req.body;
    if (!utorid || typeof utorid !== 'string') {
        return res.status(400).json({"error": "Invalid payload"})
    }

    const findUser = await prisma.user.findUnique({where: {utorid: utorid}});
    if (!findUser) {
        return res.status(404).json({ "error": "user not found" });
    }

    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include: {guests: true}});
    if (!findEvent) {
        return res.status(404).json({ "error": "event not found" });
    }
    if (findEvent.endTime < new Date()){
        return res.status(410).json({ "error": "event ended" });
    }
    const isGuest = findEvent.guests.some(guest => guest['utorid'] === utorid);
    if (isGuest){
        return res.status(400).json({"error": "Guest cannot be organizer"})
    }

    const addOrganizer = await prisma.event.update({
        where: {id: eventId},
        data: {
            organizers: {
                connect: {
                    utorid: utorid,
                },
            },
        },
    })

    const getUpdatedEvent = await prisma.event.findUnique({
        where: {id: eventId},
        select: {
            id: true,
            name: true,
            location: true,
            organizers: {
                select: {
                    id: true,
                    utorid: true,
                    name: true
                }
            }
        }
    });

    return res.status(201).json(getUpdatedEvent);
})

//events/:eventId/organizers/:userId Remove an organizer from this event.
router.delete('/:eventId/organizers/:userId', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const userId = Number.parseInt(req.params['userId']);
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    if (isNaN(userId)) {
        return res.status(404).json({ "error": "invalid userId" });
    }

    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include: {organizers: true}});
    if (!findEvent){
        return res.status(404).json({ "error": "Event not found" });
    }

    let found = false
    const findOrganizer = findEvent.organizers.some(organizer => organizer['id'] === userId);
    if (!findOrganizer) {
        return res.status(404).json({ "error": "invalid userId" });
    }

    const updateEvent = await prisma.event.update({
        where: {id: userId},
        data: {organizers: {
                disconnect: {id: userId}
            }
        }
    });
    return res.status(204).send();
});

//events/:eventId/guests Add a guest to this event.
router.post('/:eventId/guests', jwtAuth, async (req, res) => {
    const eventId = Number.parseInt(req.params['eventId']);
    const {utorid} = req.body;
    const user = req.user;

    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    if (!utorid || typeof utorid !== 'string') {
        return res.status(400).json({"error": "Invalid payload"})
    }

    const findUser = await prisma.user.findUnique({where: {utorid: utorid}});
    if (!findUser){
        return res.status(404).json({ "error": "user not found" });
    }

    const findEvent = await prisma.event.findUnique({where: {id:eventId }, include: {organizers: true,}});
    if (!findEvent){
        return res.status(404).json({ "error": "Event not found" });
    }
    if (findEvent.endTime < new Date() || findEvent.capacity === findEvent.numGuests){
        return res.status(410).json({ "error": "Event is full or ended" });
    }

    const isOrganizer = findEvent.organizers.some(organizer => organizer['id'] === user.id);
    if (user.role !== 'manager' && user.role !== 'superuser' && !isOrganizer){
        return res.status(403).json({ "error": "Not authorized to add guest" });
    }
    const isOgranizerbyUtorid = findEvent.organizers.some(organizer => organizer['utorid'] === utorid);
    if (isOgranizerbyUtorid) {
        return res.status(400).json({ "error": "Guest cannot be registered as an organizer" });
    }

    const updateGuestNum = findEvent.numGuests + 1;
    const updateEvent = await prisma.event.update({
        where: {id: eventId},
        data: {
            numGuests: updateGuestNum,
            guests: {
                connect : {
                    utorid: utorid,
                },
            },
        },
    });

    const getUpdatedEvent = await prisma.event.findUnique({
        where: {id: eventId},
        select: {
            id: true,
            name: true,
            location: true,
            guests: {select: {
                    id: true,
                    utorid: true,
                    name: true,
                }},
            numGuests: true,
        }
    })
    return res.status(201).json({
        "id": getUpdatedEvent.id,
        "name": getUpdatedEvent.name,
        "location": getUpdatedEvent.location,
        "guestAdded" : {
            "id": findUser.id,
            "utorid": findUser.utorid,
            "name": findUser.name,
        },
        "numGuests": getUpdatedEvent.numGuests
    });
});

//events/:eventId/guests/:userId Remove a guest from this event.
router.delete('/:eventId/guests/:userId', jwtAuth, requireRole('manager', 'superuser'), async (req, res) => {
    const userId = Number.parseInt(req.params['userId']);
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    if (isNaN(userId)) {
        return res.status(404).json({ "error": "invalid userId" });
    }
    const findEvent = await prisma.event.findUnique({where: {id: eventId}});
    if (!findEvent){
        return res.status(404).json({ "error": "Event not found" });
    }
    const isGuest = findEvent.guests.some(guest => guest['id'] === userId);
    if (!isGuest){
        return res.status(400).json({ "error": "User is not a guest" });
    }

    const newNumGuests = findEvent.numGuests - 1;
    const updateEvent = await prisma.event.update({
        where: {id: eventId},
        data: {
            guests: {
                disconnect: {
                    id: userId,
                }
            },
            numGuests: newNumGuests,
        }
    });
    return res.status(204).send();
});

//events/:eventId/guests/me Add the logged-in user to the event
router.post('/:eventId/guests/me', jwtAuth, async (req, res) => {
    const user = req.user;
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include:{guests: true, organizers: true}});
    if (!findEvent){
        return res.status(404).json({ "error": "Event not found" });
    }
    const isGuest = findEvent.guests.some(guest => guest['id'] === user.userId);
    if (isGuest){
        return res.status(400).json({ "error": "User is already a guest" });
    }
    if (findEvent.capacity === findEvent.numGuests){
        return res.status(400).json({ "error": "Event is full" });
    }
    if (findEvent.endTime < new Date()){
        return res.status(410).json({ "error": "event ended" });
    }
    const isOrganizer = findEvent.organizers.some(organizer => organizer['id'] === user.id);
    if (isOrganizer){
        return res.status(400).json({ "error": "User is already an organizer" });
    }

    const newNumGuests = findEvent.numGuests + 1;
    const updateEvent = await prisma.event.update({
        where: {id: eventId},
        data: {
            guests: {
                connect: {
                    utorid: user.utorid,
                }
            },
            numGuests: newNumGuests,
        }
    });

    return res.status(201).json({
        "id": eventId,
        'name': updateEvent.name,
        'location': updateEvent.location,
        'guestAdded': {
            'id': user.id,
            'utorid': user.utorid,
            'name': user.name,
        },
        'numGuests': updateEvent.numGuests,
    });
});

//events/:eventId/guests/me Delete the logged-in user from this event
router.delete('/:eventId/guests/me', jwtAuth, async (req, res) => {
    const user = req.user;
    const eventId = Number.parseInt(req.params['eventId']);
    if (isNaN(eventId)) {
        return res.status(404).json({ "error": "invalid eventId" });
    }
    const findEvent = await prisma.event.findUnique({where: {id: eventId}, include: {guests: true}});
    if (!findEvent){
        return res.status(404).json({ "error": "Event not found" });
    }
    const isGuest = findEvent.guests.some(guest => guest['id'] === user.userId);
    if (!isGuest){
        return res.status(404).json({ "error": "User is not a guest" });
    }
    if (findEvent.endTime < new Date()){
        return res.status(410).json({ "error": "event ended" });
    }
    const newNumGuests = findEvent.numGuests - 1;
    const updateEvent = await prisma.event.delete({
        where: {id: eventId},
        data: {
            guests: {
                disconnect: {
                    utorid: user.utorid,
                }
            },
            numGuests: newNumGuests,
        }
    });
})

module.exports = router;