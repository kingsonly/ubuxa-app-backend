import { PrismaClient, ActionEnum, SubjectEnum } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPermissions() {
    const count = await prisma.permission.count();
    if (count > 0) {
        console.log("✅ Permissions already seeded. Skipping...");
        return;
    }

    const permissions = [];

    for (const subject of Object.values(SubjectEnum)) {
        for (const action of Object.values(ActionEnum)) {
            permissions.push({ action, subject });
        }
    }

    await prisma.permission.createMany({
        data: permissions,
    });

    console.log(`✅ Seeded ${permissions.length} permissions.`);
}

seedPermissions()
    .catch((e) => {
        console.error('❌ Seeding error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
