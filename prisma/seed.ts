import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { seedClubs } from './seeds/seed-clubs';

dotenv.config();
const prisma = new PrismaClient();

async function main() {
    console.log('🚀 전체 데이터베이스 시딩 시작...\n');

    // 1. Nations -> 2. Leagues -> 3. Clubs -> 4. Players 순서 유지
    await seedClubs(prisma);

    console.log('\n🎉 모든 데이터 시딩이 완료되었습니다!');
}

main()
    .catch((e) => {
        console.error('❌ 시딩 중 에러 발생:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });