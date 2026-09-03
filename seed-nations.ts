import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import axios from 'axios';
import nationsData from './nations.json';

// Supabase 연결 설정 (.env 파일에 있는 정보 사용)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function seedNations() {
    console.log('🌍 국가 데이터 및 국기 이미지 시딩 시작...');

    for (const nation of nationsData) {
        try {
            // 1. FlagCDN에서 국가별 이미지 원본 가져오기 (code 예: 'kr', 'fr')
            const externalFlagUrl = `https://flagcdn.com/w80/${nation.code}.png`;
            const response = await axios.get(externalFlagUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);

            // 2. Sharp 라이브러리로 WebP 변환
            const webpBuffer = await sharp(buffer)
                .webp({ quality: 80 })
                .toBuffer();

            // 3. Supabase Storage ('fc-assets' 버킷의 nations 폴더)에 업로드
            const filePath = `nations/${nation.id}.webp`;
            const { error: uploadError } = await supabase.storage
                .from('fc-assets')
                .upload(filePath, webpBuffer, {
                    contentType: 'image/webp',
                    upsert: true,
                });

            if (uploadError) throw uploadError;

            // 4. 업로드된 파일의 Public URL(공개 주소) 따오기
            const { data: publicUrlData } = supabase.storage
                .from('fc-assets')
                .getPublicUrl(filePath);

            const flagUrl = publicUrlData.publicUrl;

            // 5. Supabase 'nations' 테이블에 ID, 이름, 국기 URL 저장
            const { error: dbError } = await supabase
                .from('nations')
                .upsert({
                    id: nation.id,
                    name: nation.name,
                    flag_url: flagUrl,
                });

            if (dbError) throw dbError;

            console.log(`✅ [성공] ${nation.name} 저장 완료`);
        } catch (err) {
            console.error(`❌ [실패] ${nation.name} 처리 중 에러 발생:`, err);
        }
    }

    console.log('🎉 모든 국가 데이터 시딩 완료!');
}

seedNations();