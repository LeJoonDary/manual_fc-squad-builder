import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { parse } from 'csv-parse/sync';

// 1. 설정 (필요 시 시트 ID 및 gid 수정)
const SPREADSHEET_ID = '1r37ic64fG6AikwUm5P3IiPohJP4HQlOJyBE8UNSXOhA'; // 구글 시트 URL의 /d/ 뒷부분
const SHEET_GID = '53136725'; // 정제한 새 탭의 gid (URL 끝부분 gid=XXXXX 확인)

const GOOGLE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
const OUTPUT_FILE_PATH = path.join(process.cwd(), 'data/players.json');

interface PlayerJsonData {
    id: number;
    name: string;
    long_name: string;
    height: number;
    weight: number;
    age: number;
    nation_id: number | null;
    gender: string;
}

async function parsePlayers() {
    try {
        console.log('🔄 구글 시트에서 players 데이터를 가져오는 중...');

        // CSV 데이터 가져오기
        const response = await axios.get(GOOGLE_SHEET_CSV_URL);
        const csvContent = response.data;

        // CSV 파싱 (헤더가 없는 형태이거나 첫 행이 헤더인 경우 처리)
        const records = parse(csvContent, {
            columns: false, // 배열 형태로 가져와 인덱스(0,1,2...)로 접근
            skip_empty_lines: true,
            trim: true,
        });

        console.log(`📊 가져온 총 행 수: ${records.length}`);

        const parsedPlayers: PlayerJsonData[] = [];

        for (let i = 0; i < records.length; i++) {
            const row = records[i];

            // 첫 행이 헤더 텍스트인 경우 스킵 (숫자로 변환 안 되면 헤더로 판단)
            const playerId = parseInt(row[0], 10);
            if (isNaN(playerId)) continue;

            // CHOOSECOLS 순서: [0]player_id, [1]short_name, [2]long_name, [3]height_cm, [4]weight_kg, [5]age, [6]nationality_id
            const player: PlayerJsonData = {
                id: playerId,                                      // A열 (player_id)
                name: String(row[1] || '').trim(),                 // F열 (short_name)
                long_name: String(row[2] || '').trim(),            // G열 (long_name)
                height: parseInt(row[3], 10) || 180,              // O열 (height_cm)
                weight: parseInt(row[4], 10) || 75,               // P열 (weight_kg)
                age: parseInt(row[5], 10) || 25,                   // M열 (age)
                nation_id: parseInt(row[6], 10) || null,           // AA열 (nationality_id)
                gender: 'Male',                                    // 기본값
            };

            parsedPlayers.push(player);
        }

        // 결과 저장 폴더 생성 확인
        const dir = path.dirname(OUTPUT_FILE_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // JSON 파일 쓰기
        fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(parsedPlayers, null, 2), 'utf-8');
        console.log(`✅ 성공적으로 ${parsedPlayers.length}명의 players 데이터를 파싱하여 저장했습니다: ${OUTPUT_FILE_PATH}`);

    } catch (error) {
        console.error('❌ players 데이터 파싱 실패:', error);
    }
}

parsePlayers();