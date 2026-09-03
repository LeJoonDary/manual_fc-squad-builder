import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// 관리자 권한 키를 우선적으로 사용
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ .env 파일에 Supabase URL 또는 KEY가 없습니다.');
    process.exit(1);
}

// 관리자 권한으로 클라이언트 생성 (RLS 보안 정책 무시)
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function seedClubs() {
    const jsonPath = path.join(process.cwd(), 'clubs.json');
    const clubs = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    console.log(`🌱 [Clubs] 총 ${clubs.length}개 클럽 데이터 시딩 시작...`);

    const { data, error } = await supabase
        .from('clubs')
        .upsert(clubs, { onConflict: 'id' });

    if (error) {
        console.error('❌ 시딩 중 오류 발생:', error.message);
    } else {
        console.log(`✅ [Clubs] ${clubs.length}개 클럽 시딩 완료!`);
    }
}

seedClubs();