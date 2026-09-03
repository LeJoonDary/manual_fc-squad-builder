import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// anon 키 대신 권한 제한을 우회하는 service_role 키 우선 사용
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
    process.exit(1);
}

// supabaseAnonKey 대신 supabaseKey 전달
const supabase = createClient(supabaseUrl, supabaseKey);
const JSON_FILE_PATH = path.resolve('data/players.json');

async function seedPlayers() {
    try {
        console.log('🚀 Supabase로 선수 데이터 적재 시작...');

        if (!fs.existsSync(JSON_FILE_PATH)) {
            throw new Error('players.json 파일이 존재하지 않습니다.');
        }

        const fileContent = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
        const players = JSON.parse(fileContent);

        // upsert를 사용하여 데이터 중복 시 업데이트 처리
        const { data, error } = await supabase
            .from('players')
            .upsert(players, { onConflict: 'id' });

        if (error) {
            throw error;
        }

        console.log(`✅ 성공! 총 ${players.length}명의 선수 데이터가 DB에 정상 적재되었습니다.`);
    } catch (error) {
        console.error('❌ DB 적재 실패:', error);
    }
}

seedPlayers();