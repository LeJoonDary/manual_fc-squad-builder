import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ES Module 환경에서 __dirname 정의하기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface LeagueData {
    id: number;
    name: string;
    short_name: string;
    level: number;
}

async function seedLeagues() {
    try {
        // leagues.json 파일이 seed-leagues.ts와 같은 폴더에 있을 경우
        const filePath = path.join(__dirname, 'leagues.json');

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const leagues: LeagueData[] = JSON.parse(rawData);

        console.log(`총 ${leagues.length}개의 리그 데이터를 시딩합니다...`);

        const { data, error } = await supabase
            .from('leagues')
            .upsert(leagues, { onConflict: 'id' });

        if (error) {
            throw error;
        }

        console.log('leagues 테이블 시딩 성공!');
    } catch (error) {
        console.error('시딩 중 에러 발생:', error);
    }
}

seedLeagues();