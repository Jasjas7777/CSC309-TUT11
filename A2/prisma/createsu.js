/*
 * Complete this script so that it is able to add a superuser to the database
 * Usage example: 
 *   node prisma/createsu.js clive123 clive.su@mail.utoronto.ca SuperUser123!
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createSuperuser() {
    const args = process.argv;
    if (args.length !== 5) {
        console.error("Usage: node prisma/createsu.js <utorid> <email> <password>");
        process.exit(1);
    }

    const utorid = args[2];
    const email = args[3];
    const password = args[4];

    if ((utorid.length !== 7 && utorid.length !== 8) || !utorid.match(/^[a-z0-9]+$/)) {
        console.error("Invalid utorid");
        process.exit(1);
    }

    if (!email.match(/^[a-z0-9]+\.[a-z0-9]+@mail\.utoronto\.ca$/)) {
        console.error("Invalid email");
        process.exit(1);
    }

    if (password.length < 8 ||
        password.length > 20 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[@$!%*?&]/.test(password)
    ) {
        console.error("Invalid password");
        process.exit(1);
    }

    const superUser = await prisma.user.create({
        data: {
            utorid: utorid,
            email: email,
            password: password,
            role: "superuser",
            verified: true,
            createdAt: new Date()
        }
    })

    return superUser;
}

createSuperuser().catch(console.error).finally(() => prisma.$disconnect());