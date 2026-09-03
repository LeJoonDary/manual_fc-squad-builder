import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const CSV_FILE_PATH = path.resolve('data/players.csv');
const OUTPUT_FILE_PATH = path.resolve('data/players.json');

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

function parsePlayers() {
    try {
        console.log('📂 로컬 CSV 파일 읽는 중...');
        const csvContent = fs.readFileSync(CSV_FILE_PATH, 'utf-8');

        const records = parse(csvContent, {
            columns: false,
            skip_empty_lines: true,
            trim: true,
        });

        const players: PlayerJsonData[] = records.map((row: any) => ({
            id: Number(row[0]),
            name: String(row[1] || ''),
            long_name: String(row[2] || ''),
            height: Number(row[3]) || 0,
            weight: Number(row[4]) || 0,
            age: Number(row[5]) || 0,
            nation_id: row[6] ? Number(row[6]) : null,
            gender: 'Male',
        }));

        fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(players, null, 2));
        console.log(`✅ 파싱 완료! 총 ${players.length}개 데이터가 saved되었습니다.`);
    } catch (error) {
        console.error('❌ 파일 처리 실패:', error);
    }
}

parsePlayers();