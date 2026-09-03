import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedCardVersions() {
    const csvPath = path.join(process.cwd(), 'data', 'card_versions.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');

    // 1. CSV 파싱
    const records = parse(fileContent, {
        columns: [
            'player_id',      // A열
            'overall',        // B열
            'weak_foot',      // C열
            'skill_moves',    // D열
            'preferred_foot', // E열
            'club_id',        // F열
            'league_id',      // G열
            'card_code',      // H열
            'accele_type',    // I열
            'body_type',      // J열
            'version',        // K열
            'price'           // L열
        ],
        skip_empty_lines: true,
        trim: true,
    });

    // 2. DB 적재 데이터 생성 (club_id, league_id 추가)
    const cardVersions = records
        .map((row: any) => {
            const playerId = Number(row.player_id);
            if (!playerId || isNaN(playerId) || playerId <= 0) return null;

            return {
                player_id: playerId,              // int8 FK
                club_id: Number(row.club_id) || null,    // F열 (club_id 추가)
                league_id: Number(row.league_id) || null,  // G열 (league_id 추가)
                version: row.version || 'Gold',     // text
                overall: Number(row.overall) || 0,  // int2
                price: Number(row.price) || 0,      // int8
                wf: Number(row.weak_foot) || 0,     // int4 (wf)
                sm: Number(row.skill_moves) || 0,   // int4 (sm)
                preferred_foot: row.preferred_foot, // text
                accele_type: row.accele_type,       // text
                body_type: row.body_type,           // text
            };
        })
        .filter(Boolean);

    // 3. Supabase Insert 실행
    const chunkSize = 1000;
    for (let i = 0; i < cardVersions.length; i += chunkSize) {
        const chunk = cardVersions.slice(i, i + chunkSize);
        const { error } = await supabase.from('card_versions').insert(chunk);

        if (error) {
            console.error(`Error seeding chunk ${i}:`, error);
        } else {
            console.log(`Successfully seeded ${i + chunk.length} records.`);
        }
    }
}

seedCardVersions();